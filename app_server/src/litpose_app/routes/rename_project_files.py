"""Rename project files, and copy calibration, label, and model files into a project."""

from __future__ import annotations

import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import BinaryIO, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.config import Config
from litpose_app.datatypes import Project
from litpose_app.deps import ProjectInfoGetter
from litpose_app.project_cache import drop_file_check, relative_data_path
from litpose_app.routes.validate_files import (
    _MODEL_NAME_RE,
    _inspect_label_table,
    _label_header_messages,
    _session_stem_issue,
    _under,
    _validate_one_model,
    calibration_file_issues,
    label_csv_rels,
)

router = APIRouter()
_SESSION_STEM_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")
_GLOBAL_CALIBRATION_PATH = Config().GLOBAL_CALIBRATION_PATH
_CalibrationDestination = Literal["project", "session"]


class RenameLabelFileRequest(BaseModel):
    """Rename one label CSV inside its current directory."""

    projectKey: str
    path: str
    newFilename: str


class RenameLabeledDataRequest(BaseModel):
    """Rename a direct child of labeled-data/ and update label CSV index paths."""

    projectKey: str
    path: str
    newName: str


class RenamePathResponse(BaseModel):
    """The path after a successful rename."""

    ok: bool
    path: str


def _split_first_field(body: str) -> tuple[str, str]:
    """Split a CSV row into the index field and the remainder, including the comma."""
    if body.startswith('"'):
        i = 1
        while i < len(body):
            if body[i] == '"':
                if i + 1 < len(body) and body[i + 1] == '"':
                    i += 2
                    continue
                return body[: i + 1], body[i + 1 :]
            i += 1
        return body, ""
    comma = body.find(",")
    if comma < 0:
        return body, ""
    return body[:comma], body[comma:]


def _rewrite_index_field(text: str, old: str, new: str, *, prefix: bool) -> str:
    """Replace index paths after the three header rows. Other text stays as stored."""
    lines = text.splitlines(keepends=True)
    rewritten: list[str] = []
    for index, line in enumerate(lines):
        if index < 3:
            rewritten.append(line)
            continue
        newline = ""
        body = line
        if body.endswith("\r\n"):
            body, newline = body[:-2], "\r\n"
        elif body.endswith("\n"):
            body, newline = body[:-1], "\n"
        elif body.endswith("\r"):
            body, newline = body[:-1], "\r"
        if not body:
            rewritten.append(line)
            continue
        field, rest = _split_first_field(body)
        quoted = len(field) >= 2 and field.startswith('"') and field.endswith('"')
        inner = field[1:-1].replace('""', '"') if quoted else field
        normalized = inner.replace("\\", "/")
        if prefix and normalized.startswith(old):
            replacement = new + normalized[len(old) :]
        elif not prefix and normalized == old:
            replacement = new
        else:
            replacement = None
        if replacement is None:
            rewritten.append(line)
            continue
        if quoted:
            replacement = '"' + replacement.replace('"', '""') + '"'
        rewritten.append(replacement + rest + newline)
    return "".join(rewritten)


def _label_csvs(project: Project, scope: str) -> list[Path]:
    """Label CSVs in scope, excluding the model directory and data_dir/models."""
    data_dir = project.paths.data_dir
    return [
        data_dir / rel
        for rel in label_csv_rels(data_dir, project.paths.model_dir, scope)
    ]


def _path_after_move(path: Path, src: Path, dest: Path) -> Path:
    try:
        relative = path.resolve().relative_to(src.resolve())
    except ValueError:
        return path
    return dest / relative


@router.post("/app/v0/rpc/renameLabelFile")
def rename_label_file(
    request: RenameLabelFileRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> RenamePathResponse:
    """Rename a label CSV in place. The file contents are not changed."""
    project = project_info_getter(request.projectKey)
    src = Path(request.path).resolve()
    data_dir = project.paths.data_dir
    if not src.is_file() or not _under(src, data_dir):
        raise HTTPException(
            status_code=400, detail="File must be a CSV in the data directory."
        )
    model_dir = project.paths.model_dir
    if model_dir is not None and _under(src, model_dir):
        raise HTTPException(status_code=400, detail="File is inside the model directory.")
    new_name = request.newFilename.strip()
    if (
        not new_name
        or new_name in {".", ".."}
        or "/" in new_name
        or "\\" in new_name
    ):
        raise HTTPException(status_code=400, detail="Enter a filename, not a path.")
    if Path(new_name).suffix.lower() != ".csv":
        raise HTTPException(status_code=400, detail="Expected a .csv filename.")
    if new_name == src.name:
        return RenamePathResponse(ok=True, path=str(src))
    dest = src.parent / new_name
    if dest.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists.")
    old_rel = relative_data_path(data_dir, src)
    src.rename(dest)
    if old_rel is not None:
        drop_file_check(data_dir, "labels", old_rel)
    new_rel = relative_data_path(data_dir, dest)
    if new_rel is not None:
        drop_file_check(data_dir, "labels", new_rel)
    return RenamePathResponse(ok=True, path=str(dest))


class RenameCalibrationFileRequest(BaseModel):
    """Rename a session calibration file inside calibrations/."""

    projectKey: str
    path: str
    newFilename: str


@router.post("/app/v0/rpc/renameCalibrationFile")
def rename_calibration_file(
    request: RenameCalibrationFileRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> RenamePathResponse:
    """Rename calibrations/<session>.toml. The project file calibration.toml stays put."""
    project = project_info_getter(request.projectKey)
    data_dir = project.paths.data_dir.resolve()
    cal_dir = data_dir / "calibrations"
    src = Path(request.path).resolve()
    if not src.is_file() or src.parent != cal_dir:
        raise HTTPException(
            status_code=400,
            detail="Choose a calibration file inside calibrations/.",
        )
    new_name = request.newFilename.strip()
    if (
        not new_name
        or new_name in {".", ".."}
        or "/" in new_name
        or "\\" in new_name
        or Path(new_name).suffix.lower() != ".toml"
    ):
        raise HTTPException(status_code=400, detail="Enter a session filename ending in .toml.")
    stem = Path(new_name).stem
    if not stem or not _SESSION_STEM_RE.fullmatch(stem):
        raise HTTPException(
            status_code=400,
            detail="Session id may use letters, digits, and . _ -.",
        )
    if new_name == src.name:
        return RenamePathResponse(ok=True, path=str(src))
    dest = cal_dir / new_name
    if dest.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists.")
    old_rel = relative_data_path(data_dir, src)
    src.rename(dest)
    if old_rel is not None:
        drop_file_check(data_dir, "calibration", old_rel)
    new_rel = relative_data_path(data_dir, dest)
    if new_rel is not None:
        drop_file_check(data_dir, "calibration", new_rel)
    return RenamePathResponse(ok=True, path=str(dest))


class ImportCalibrationResponse(BaseModel):
    """A copied calibration file and the camera-group problems found in it."""

    ok: bool
    path: str
    issues: list[str] = []


class ImportCalibrationFileRequest(BaseModel):
    """Copy one server .toml to the project file or into calibrations/."""

    projectKey: str
    serverPath: str
    destination: _CalibrationDestination = "session"
    overwrite: bool = False


def _calibration_filename_issue(filename: str) -> str | None:
    """The stem is the session id and uses the same character rule as rename."""
    name = filename.strip()
    if (
        not name
        or name in {".", ".."}
        or "/" in name
        or "\\" in name
        or Path(name).suffix.lower() != ".toml"
    ):
        return "Enter a session filename ending in .toml."
    stem = Path(name).stem
    if not stem or not _SESSION_STEM_RE.fullmatch(stem):
        return "Session id may use letters, digits, and . _ -."
    return None


def _new_calibration_path(data_dir: Path, filename: str) -> Path:
    """Return calibrations/<filename>, creating the folder when it is missing.

    An existing destination raises 409 before the folder is created for a new name.
    """
    issue = _calibration_filename_issue(filename)
    if issue:
        raise HTTPException(status_code=400, detail=issue)
    dest_dir = data_dir / "calibrations"
    dest = dest_dir / Path(filename.strip()).name
    if dest.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists.")
    dest_dir.mkdir(parents=True, exist_ok=True)
    return dest


def _copy_into_new_file(dest: Path, source: BinaryIO) -> None:
    """Write dest only when it does not already exist. The source is left in place."""
    try:
        fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    except FileExistsError as exc:
        raise HTTPException(
            status_code=409, detail="A file with that name already exists."
        ) from exc
    try:
        with os.fdopen(fd, "wb") as out:
            shutil.copyfileobj(source, out)
    except Exception:
        dest.unlink(missing_ok=True)
        raise


def _replace_file(dest: Path, source: BinaryIO) -> None:
    """Write a temp file in dest's folder, then replace dest.

    A failed copy deletes the temp file and leaves an existing dest unchanged.
    The parent of a project file is the data directory, so this does not create
    calibrations/.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".calibration-", suffix=".tmp", dir=dest.parent)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as out:
            shutil.copyfileobj(source, out)
        os.chmod(tmp, 0o644)
        os.replace(tmp, dest)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def _import_one_calibration(
    project: Project,
    filename: str,
    source: BinaryIO,
    *,
    destination: str,
    overwrite: bool,
) -> ImportCalibrationResponse:
    """Copy one .toml to calibration.toml or calibrations/<filename>."""
    data_dir = project.paths.data_dir
    if destination == "project":
        if Path(filename).suffix.lower() != ".toml":
            raise HTTPException(status_code=400, detail="Choose a .toml file.")
        dest = data_dir / _GLOBAL_CALIBRATION_PATH
        if overwrite:
            _replace_file(dest, source)
        elif dest.exists():
            raise HTTPException(
                status_code=409, detail="A file with that name already exists."
            )
        else:
            _copy_into_new_file(dest, source)
        return _imported_calibration(project, dest)
    if destination != "session":
        raise HTTPException(
            status_code=400, detail="Choose a project file or a session file."
        )
    if overwrite:
        issue = _calibration_filename_issue(filename)
        if issue:
            raise HTTPException(status_code=400, detail=issue)
        dest = data_dir / "calibrations" / Path(filename.strip()).name
        _replace_file(dest, source)
        return _imported_calibration(project, dest)
    dest = _new_calibration_path(data_dir, filename)
    _copy_into_new_file(dest, source)
    return _imported_calibration(project, dest)


def _server_toml(server_path: str) -> Path:
    """Resolve a .toml file that stays under the home directory."""
    src = Path(server_path).expanduser().resolve()
    home = Path.home().resolve()
    try:
        src.relative_to(home)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Choose a .toml file under the home directory.",
        ) from exc
    if not src.is_file() or src.suffix.lower() != ".toml":
        raise HTTPException(
            status_code=400,
            detail="Choose a .toml file under the home directory.",
        )
    return src


def _imported_calibration(project: Project, dest: Path) -> ImportCalibrationResponse:
    """The file is already on disk. Report the same problems Validate All would."""
    views = list(project.config.view_names)
    return ImportCalibrationResponse(
        ok=True,
        path=str(dest),
        issues=calibration_file_issues(dest, views),
    )


@router.post("/app/v0/rpc/importCalibrationFile")
def import_calibration_file(
    request: ImportCalibrationFileRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ImportCalibrationResponse:
    """Copy a server .toml to calibration.toml or calibrations/<filename>.

    The source is not moved or deleted. overwrite replaces that one destination.
    """
    project = project_info_getter(request.projectKey)
    src = _server_toml(request.serverPath)
    with src.open("rb") as inp:
        return _import_one_calibration(
            project,
            src.name,
            inp,
            destination=request.destination,
            overwrite=request.overwrite,
        )


@router.post("/app/v0/rpc/importCalibrationUpload")
def import_calibration_upload(
    projectKey: str = Form(...),
    file: UploadFile = File(...),
    destination: str = Form("session"),
    overwrite: str = Form("false"),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ImportCalibrationResponse:
    """Upload a local .toml to calibration.toml or calibrations/<filename>."""
    project = project_info_getter(projectKey)
    filename = Path(file.filename or "").name
    return _import_one_calibration(
        project,
        filename,
        file.file,
        destination=destination,
        overwrite=overwrite.strip().lower() == "true",
    )


@router.post("/app/v0/rpc/renameLabeledDataFolder")
def rename_labeled_data_folder(
    request: RenameLabeledDataRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
    config: Config = Depends(deps.config),
) -> RenamePathResponse:
    """Rename a labeled-data child and update matching label CSV index paths.

    A directory rename replaces the ``labeled-data/<old>/`` prefix. A loose file
    rename replaces an index that equals ``labeled-data/<old>`` exactly.
    ``old_extra`` is not treated as ``old``. Header rows and other cells stay
    as stored. If a CSV write fails, the original text is restored and the
    folder or file is moved back.
    """
    project = project_info_getter(request.projectKey)
    root = (project.paths.data_dir / "labeled-data").resolve()
    src = Path(request.path).resolve()
    if not src.exists() or src.parent != root:
        raise HTTPException(
            status_code=400,
            detail="Choose a file or folder directly inside labeled-data.",
        )
    new_name = request.newName.strip()
    if not new_name or new_name in {".", ".."} or "/" in new_name or "\\" in new_name:
        raise HTTPException(status_code=400, detail="Enter a name, not a path.")
    if src.is_dir():
        issue = _session_stem_issue(
            new_name, list(project.config.view_names), kind="directory"
        )
        if issue:
            raise HTTPException(status_code=400, detail=issue)
        old_index = f"labeled-data/{src.name}/"
        new_index = f"labeled-data/{new_name}/"
        prefix = True
    else:
        old_index = f"labeled-data/{src.name}"
        new_index = f"labeled-data/{new_name}"
        prefix = False
    if new_name == src.name:
        return RenamePathResponse(ok=True, path=str(src))
    dest = src.parent / new_name
    if dest.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists.")

    prepared: list[tuple[Path, str, str]] = []
    for csv in _label_csvs(project, config.LABEL_CSV_SCOPE):
        try:
            original = csv.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(
                status_code=400, detail=f"Could not read {csv.name} as text."
            ) from exc
        updated = _rewrite_index_field(original, old_index, new_index, prefix=prefix)
        if updated != original:
            prepared.append((csv, original, updated))

    try:
        src.rename(dest)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Could not rename: {exc}") from exc

    written: list[tuple[Path, str]] = []
    try:
        for csv, original, updated in prepared:
            target = _path_after_move(csv, src, dest)
            target.write_text(updated, encoding="utf-8")
            written.append((target, original))
    except Exception as exc:
        for target, original in written:
            target.write_text(original, encoding="utf-8")
        if dest.exists() and not src.exists():
            dest.rename(src)
        raise HTTPException(
            status_code=500, detail="Could not update label CSV paths."
        ) from exc
    data_dir = project.paths.data_dir
    drop_file_check(data_dir, "labeled-data", f"labeled-data/{src.name}")
    drop_file_check(data_dir, "labeled-data", f"labeled-data/{dest.name}")
    for target, _original in written:
        rel = relative_data_path(data_dir, target)
        if rel is not None:
            drop_file_check(data_dir, "labels", rel)
    return RenamePathResponse(ok=True, path=str(dest))


class ImportedFileResponse(BaseModel):
    """A copied label file or model folder, plus the problems found in it."""

    ok: bool
    path: str
    issues: list[str] = []
    warnings: list[str] = []


class ImportServerPathRequest(BaseModel):
    """Copy one server file or folder into the project."""

    projectKey: str
    serverPath: str


def _server_csv(server_path: str) -> Path:
    """Resolve a .csv file that stays under the home directory."""
    src = Path(server_path).expanduser().resolve()
    home = Path.home().resolve()
    try:
        src.relative_to(home)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Choose a .csv file under the home directory.",
        ) from exc
    if not src.is_file() or src.suffix.lower() != ".csv":
        raise HTTPException(
            status_code=400,
            detail="Choose a .csv file under the home directory.",
        )
    return src


def _new_label_path(data_dir: Path, filename: str) -> Path:
    """Return data_dir/<filename> when that .csv name is free."""
    name = Path(filename).name
    if not name.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Expected a .csv filename.",
        )
    dest = data_dir / name
    if dest.exists():
        raise HTTPException(
            status_code=409, detail="A file with that name already exists."
        )
    return dest


def _label_copy_report(project: Project, dest: Path) -> tuple[list[str], list[str]]:
    """Issues that hide the file, and warnings the labeler can still open past."""
    header_issue, header_warning = _label_header_messages(dest)
    if header_issue:
        return [header_issue], []
    warnings = [header_warning] if header_warning else []
    table_issues, table_warnings, _deps = _inspect_label_table(
        dest,
        project.paths.data_dir,
        list(project.config.keypoint_names),
    )
    warnings.extend(table_warnings)
    return table_issues, warnings


def _imported_label(project: Project, dest: Path) -> ImportedFileResponse:
    issues, warnings = _label_copy_report(project, dest)
    return ImportedFileResponse(
        ok=True,
        path=dest.name,
        issues=issues,
        warnings=warnings,
    )


@router.post("/app/v0/rpc/importLabelFile")
def import_label_file(
    request: ImportServerPathRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ImportedFileResponse:
    """Copy a server CSV onto the data-directory root. Does not move the source."""
    project = project_info_getter(request.projectKey)
    src = _server_csv(request.serverPath)
    dest = _new_label_path(project.paths.data_dir, src.name)
    with src.open("rb") as inp:
        _copy_into_new_file(dest, inp)
    return _imported_label(project, dest)


@router.post("/app/v0/rpc/importLabelUpload")
def import_label_upload(
    projectKey: str = Form(...),
    file: UploadFile = File(...),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ImportedFileResponse:
    """Upload a local CSV onto the data-directory root."""
    project = project_info_getter(projectKey)
    filename = Path(file.filename or "").name
    dest = _new_label_path(project.paths.data_dir, filename)
    _copy_into_new_file(dest, file.file)
    return _imported_label(project, dest)


def _server_directory(server_path: str) -> Path:
    """Resolve a directory that stays under the home directory."""
    src = Path(server_path).expanduser().resolve()
    home = Path.home().resolve()
    try:
        src.relative_to(home)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Choose a folder under the home directory.",
        ) from exc
    if not src.is_dir():
        raise HTTPException(
            status_code=400,
            detail="Choose a folder under the home directory.",
        )
    return src


def _path_inside(parent: Path, child: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return child.resolve() != parent.resolve()


def _new_model_dir(model_dir: Path, folder_name: str, source: Path | None) -> Path:
    """Return model_dir/<folder name> when that folder does not already exist."""
    name = folder_name.strip()
    if (
        not name
        or name in {".", ".."}
        or "/" in name
        or "\\" in name
        or _MODEL_NAME_RE.fullmatch(name) is None
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Directory name must match the create-model rule "
                "(letters, digits, and . _ -)."
            ),
        )
    root = model_dir.resolve()
    dest = (root / name).resolve()
    try:
        dest.relative_to(root)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Choose a model folder inside the model directory.",
        ) from exc
    if source is not None:
        src = source.resolve()
        # Dest inside the source would make copytree recurse.
        if src == dest or _path_inside(dest, src) or _path_inside(src, dest):
            raise HTTPException(
                status_code=400,
                detail="Choose a folder outside the destination.",
            )
    if dest.exists():
        raise HTTPException(
            status_code=409,
            detail="A model folder with that name already exists.",
        )
    root.mkdir(parents=True, exist_ok=True)
    return dest


def _model_upload_rels(filenames: list[str]) -> tuple[str, list[Path]]:
    """Return the shared folder name and paths that stay inside that folder."""
    folder: str | None = None
    rels: list[Path] = []
    for raw in filenames:
        text = raw.replace("\\", "/").strip().lstrip("/")
        path = Path(text)
        parts = path.parts
        if (
            not text
            or path.is_absolute()
            or any(part in {"", ".", ".."} for part in parts)
            or len(parts) < 2
        ):
            raise HTTPException(
                status_code=400, detail="Choose files inside one model folder."
            )
        if folder is None:
            folder = parts[0]
        elif parts[0] != folder:
            raise HTTPException(
                status_code=400, detail="Choose files inside one model folder."
            )
        rels.append(Path(*parts))
    if folder is None:
        raise HTTPException(status_code=400, detail="Choose a model folder.")
    return folder, rels


def _imported_model(project: Project, dest: Path) -> ImportedFileResponse:
    check = _validate_one_model(dest, list(project.config.view_names))
    return ImportedFileResponse(ok=True, path=dest.name, issues=check.issues)


@router.post("/app/v0/rpc/importModelDirectory")
def import_model_directory(
    request: ImportServerPathRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ImportedFileResponse:
    """Copy a server directory to model_dir/<folder name>. Does not move the source."""
    project = project_info_getter(request.projectKey)
    src = _server_directory(request.serverPath)
    dest = _new_model_dir(project.paths.model_dir, src.name, src)
    try:
        shutil.copytree(src, dest)
    except Exception:
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        raise
    return _imported_model(project, dest)


@router.post("/app/v0/rpc/importModelUpload")
def import_model_upload(
    projectKey: str = Form(...),
    files: list[UploadFile] = File(...),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ImportedFileResponse:
    """Upload a local model folder into model_dir/<folder name>."""
    project = project_info_getter(projectKey)
    folder, rels = _model_upload_rels([upload.filename or "" for upload in files])
    dest = _new_model_dir(project.paths.model_dir, folder, None)
    dest.mkdir()
    try:
        for upload, rel in zip(files, rels, strict=True):
            target = (dest / Path(*rel.parts[1:])).resolve()
            target.relative_to(dest.resolve())
            target.parent.mkdir(parents=True, exist_ok=True)
            _copy_into_new_file(target, upload.file)
    except Exception:
        shutil.rmtree(dest, ignore_errors=True)
        raise
    return _imported_model(project, dest)
