"""Rename project files, and copy calibration .toml files into calibrations/."""

from __future__ import annotations

import os
import re
import shutil
from pathlib import Path
from typing import BinaryIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.datatypes import Project
from litpose_app.deps import ProjectInfoGetter
from litpose_app.routes.rglob import _rglob
from litpose_app.routes.validate_files import (
    _label_filename_issue,
    _session_stem_issue,
    _under,
)

router = APIRouter()
_SESSION_STEM_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


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


def _label_csvs(project: Project) -> list[Path]:
    """Every CSV under the data directory except files in the model directory."""
    data_dir = project.paths.data_dir
    model_dir = project.paths.model_dir
    paths: list[Path] = []
    for entry in _rglob(str(data_dir), pattern="**/*.csv", no_dirs=True):
        full = data_dir / Path(entry["path"])
        if model_dir is not None and _under(full, model_dir):
            continue
        paths.append(full)
    return paths


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
    issue = _label_filename_issue(new_name, list(project.config.view_names))
    if issue:
        raise HTTPException(status_code=400, detail=issue)
    if new_name == src.name:
        return RenamePathResponse(ok=True, path=str(src))
    dest = src.parent / new_name
    if dest.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists.")
    src.rename(dest)
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
    src.rename(dest)
    return RenamePathResponse(ok=True, path=str(dest))


class ImportCalibrationFileRequest(BaseModel):
    """Copy one server .toml into calibrations/."""

    projectKey: str
    serverPath: str


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


@router.post("/app/v0/rpc/importCalibrationFile")
def import_calibration_file(
    request: ImportCalibrationFileRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> RenamePathResponse:
    """Copy a server .toml into calibrations/<filename>. Does not move or delete the source."""
    project = project_info_getter(request.projectKey)
    src = _server_toml(request.serverPath)
    dest = _new_calibration_path(project.paths.data_dir, src.name)
    with src.open("rb") as inp:
        _copy_into_new_file(dest, inp)
    return RenamePathResponse(ok=True, path=str(dest))


@router.post("/app/v0/rpc/importCalibrationUpload")
def import_calibration_upload(
    projectKey: str = Form(...),
    file: UploadFile = File(...),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> RenamePathResponse:
    """Upload a local .toml into calibrations/<filename>."""
    project = project_info_getter(projectKey)
    filename = Path(file.filename or "").name
    dest = _new_calibration_path(project.paths.data_dir, filename)
    _copy_into_new_file(dest, file.file)
    return RenamePathResponse(ok=True, path=str(dest))


@router.post("/app/v0/rpc/renameLabeledDataFolder")
def rename_labeled_data_folder(
    request: RenameLabeledDataRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
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
    for csv in _label_csvs(project):
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
    return RenamePathResponse(ok=True, path=str(dest))
