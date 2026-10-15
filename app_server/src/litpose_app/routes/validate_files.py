"""Report name, format, and folder problems for one sector of a project."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

import pandas as pd
import yaml
from aniposelib.cameras import CameraGroup
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.datatypes import Project
from litpose_app.deps import ProjectInfoGetter
from litpose_app.project_cache import (
    dir_record,
    file_record,
    fresh_file_checks,
    model_record,
    project_context,
    replace_file_checks,
)
from litpose_app.routes.rglob import _rglob
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row

router = APIRouter()

_NAME_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")
_MODEL_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9-._]+$")
_FRAME_RE = re.compile(r"[A-Za-z_-]+\d+\.(png|jpg)\Z")
_LABEL_INDEX_RE = re.compile(r"labeled-data/[^/]+/[A-Za-z_-]+\d+\.(png|jpg)\Z")
# Pandas rewrites a repeated scorer as rick, rick.1, rick.2.
_PANDAS_SCORER_SUFFIX_RE = re.compile(r"\.\d+\Z")
_ISSUE_LIMIT = 8


class ValidateProjectFilesRequest(BaseModel):
    """Which project sector to check. Files are not modified."""

    projectKey: str
    sector: Literal["labels", "labeled-data", "models", "calibration"]


class FileCheck(BaseModel):
    """One path and the problems found for it."""

    path: str
    issues: list[str] = []
    warnings: list[str] = []


class ValidateProjectFilesResponse(BaseModel):
    """Validation results. Empty issue lists mean the path passed."""

    items: list[FileCheck]


def _cap(messages: list[str], limit: int = _ISSUE_LIMIT) -> list[str]:
    if len(messages) <= limit:
        return messages
    hidden = len(messages) - limit
    return [*messages[:limit], f"{hidden} more not shown."]


def _summarize_paths(label: str, paths: list[str], limit: int = 5) -> str | None:
    if not paths:
        return None
    shown = ", ".join(paths[:limit])
    extra = len(paths) - limit
    suffix = f" (+{extra} more)" if extra > 0 else ""
    return f"{label}: {shown}{suffix}"


def _under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def _session_stem_issue(stem: str, views: list[str], *, kind: str) -> str | None:
    if not _NAME_RE.fullmatch(stem):
        return f"{kind.capitalize()} name contains invalid characters."
    if not views:
        return None
    if "_" not in stem:
        return f"{kind.capitalize()} name must be of the form session_view."
    session, _, view = stem.rpartition("_")
    if not session or not view:
        return f"Invalid session/view in {kind} name."
    if view not in views:
        return f"Unknown view: {view}"
    return None


def _label_filename_issue(filename: str, views: list[str]) -> str | None:
    stem = Path(filename).stem
    if not views:
        if stem in {"CollectedData", "CollectedData_test"}:
            return None
        return "Expected CollectedData.csv or CollectedData_test.csv."
    if not stem.startswith("CollectedData_"):
        return "Expected CollectedData_<view>.csv or CollectedData_<view>_test.csv."
    rest = stem[len("CollectedData_") :]
    view = rest[: -len("_test")] if rest.endswith("_test") else rest
    if not view or view not in views:
        return f"Unknown view in filename: {view or '(missing)'}."
    return None


def _keypoint_warning(bodyparts: set[str], keypoints: list[str]) -> str | None:
    expected = set(keypoints)
    if not expected:
        return None
    missing = sorted(expected - bodyparts)
    extra = sorted(bodyparts - expected)
    if not missing and not extra:
        return None
    parts: list[str] = []
    if missing:
        parts.append("missing " + ", ".join(missing))
    if extra:
        parts.append("extra " + ", ".join(extra))
    return "Bodyparts do not match project keypoints (" + "; ".join(parts) + ")."


def _label_header_issue(full: Path) -> str | None:
    """Return a format problem, or None when each scorer and bodypart has x and y.

    A trailing pandas suffix on the scorer (``rick.1``) is ignored, so ``rick``
    and ``rick.1`` count as the same scorer. The file is not rewritten.
    """
    message = (
        "Not a label CSV: need 3 header rows (scorer, bodyparts, coords) "
        "with x and y for each bodypart."
    )
    try:
        df = pd.read_csv(full, header=[0, 1, 2], nrows=0)
        df = fix_empty_first_row(df)
    except Exception:
        return message
    if not isinstance(df.columns, pd.MultiIndex) or df.columns.nlevels != 3:
        return message
    coords_by_pair: dict[tuple[str, str], set[str]] = {}
    for col in df.columns:
        if col[2] not in ("x", "y"):
            continue
        scorer = _PANDAS_SCORER_SUFFIX_RE.sub("", str(col[0]), count=1)
        bodypart = str(col[1])
        coords_by_pair.setdefault((scorer, bodypart), set()).add(str(col[2]))
    if not coords_by_pair:
        return message
    incomplete: list[str] = []
    seen: set[str] = set()
    for (_scorer, bodypart), coords in coords_by_pair.items():
        if coords == {"x", "y"} or bodypart in seen:
            continue
        seen.add(bodypart)
        incomplete.append(bodypart)
    if incomplete:
        shown = ", ".join(incomplete[:_ISSUE_LIMIT])
        return f"Bodyparts missing x or y: {shown}."
    return None


def _inspect_label_table(
    full: Path, data_dir: Path, keypoints: list[str]
) -> tuple[list[str], list[str], list[dict]]:
    """Issues, warnings, and whether each indexed image existed.

    The third list is only valid index paths. A later cache read stats those
    paths again, because deleting a frame does not change the CSV.
    """
    try:
        df = pd.read_csv(full, header=[0, 1, 2], index_col=0)
        df = fix_empty_first_row(df)
    except Exception as exc:
        return [f"Could not read label rows: {exc}"], [], []

    bad: list[str] = []
    missing: list[str] = []
    deps: list[dict] = []
    data_resolved = data_dir.resolve()
    for raw in df.index:
        text = str(raw).strip()
        if text in {"", "nan", "None"}:
            continue
        rel = text.replace("\\", "/")
        if rel.startswith("/") or ".." in Path(rel).parts:
            bad.append(rel)
            continue
        if _LABEL_INDEX_RE.fullmatch(rel) is None:
            bad.append(rel)
            continue
        target = (data_resolved / rel).resolve()
        try:
            target.relative_to(data_resolved)
        except ValueError:
            bad.append(rel)
            continue
        exists = target.is_file()
        deps.append({"path": rel, "exists": exists})
        if not exists:
            missing.append(rel)

    issues: list[str] = []
    bad_msg = _summarize_paths(
        "Index paths do not match labeled-data/<dir>/<name><digits>.png or .jpg",
        bad,
    )
    if bad_msg:
        issues.append(bad_msg)
    missing_msg = _summarize_paths("Missing images", missing)
    if missing_msg:
        issues.append(missing_msg)

    bodyparts = {
        str(col[1])
        for col in df.columns
        if len(col) >= 3 and col[2] in ("x", "y")
    }
    warnings: list[str] = []
    warning = _keypoint_warning(bodyparts, keypoints)
    if warning:
        warnings.append(warning)
    return issues, warnings, deps


def _check_context(project: Project) -> dict[str, list[str]]:
    return project_context(
        list(project.config.view_names), list(project.config.keypoint_names)
    )


def _validate_labels(
    project: Project, *, remember: bool = True
) -> tuple[list[FileCheck], dict[str, dict]]:
    data_dir = project.paths.data_dir
    model_dir = project.paths.model_dir
    views = list(project.config.view_names)
    context = _check_context(project)
    items: list[FileCheck] = []
    records: dict[str, dict] = {}
    entries = _rglob(str(data_dir), pattern="**/*.csv", no_dirs=True)
    for entry in entries:
        rel = Path(entry["path"])
        full = data_dir / rel
        if _under(full, data_dir / "models") or (
            model_dir is not None and _under(full, model_dir)
        ):
            continue
        issues: list[str] = []
        warnings: list[str] = []
        deps: list[dict] = []
        name_issue = _label_filename_issue(rel.name, views)
        if name_issue:
            issues.append(name_issue)
        header_issue = _label_header_issue(full)
        if header_issue:
            issues.append(header_issue)
        else:
            table_issues, table_warnings, deps = _inspect_label_table(
                full, data_dir, list(project.config.keypoint_names)
            )
            issues.extend(table_issues)
            warnings.extend(table_warnings)
        rel_posix = rel.as_posix()
        items.append(FileCheck(path=rel_posix, issues=issues, warnings=warnings))
        if not remember:
            continue
        record = file_record(
            full, issues=issues, warnings=warnings, context=context, deps=deps
        )
        if record is not None:
            records[rel_posix] = record
    return items, records


def _validate_labeled_data(
    project: Project,
) -> tuple[list[FileCheck], dict[str, dict]]:
    data_dir = project.paths.data_dir
    root = data_dir / "labeled-data"
    if not root.is_dir():
        return [], {}
    views = list(project.config.view_names)
    context = _check_context(project)
    items: list[FileCheck] = []
    records: dict[str, dict] = {}
    children = sorted(root.iterdir(), key=lambda p: p.name.lower())
    for child in children:
        rel = f"labeled-data/{child.name}"
        if not child.is_dir():
            issues = ["Expected a session directory."]
            items.append(FileCheck(path=rel, issues=issues))
            record = dir_record(child, issues=issues, warnings=[], context=context)
            if record is not None:
                records[rel] = record
            continue
        issues = []
        name_issue = _session_stem_issue(child.name, views, kind="directory")
        if name_issue:
            issues.append(name_issue)
        unexpected: list[str] = []
        for grandchild in sorted(child.iterdir(), key=lambda p: p.name.lower()):
            if grandchild.is_dir():
                unexpected.append(f"Unexpected subdirectory: {grandchild.name}")
            elif _FRAME_RE.fullmatch(grandchild.name) is None:
                unexpected.append(f"Unexpected file: {grandchild.name}")
        issues.extend(_cap(unexpected))
        items.append(FileCheck(path=rel, issues=issues))
        record = dir_record(child, issues=issues, warnings=[], context=context)
        if record is not None:
            records[rel] = record
    return items, records


def _walk_model_dirs(model_dir: Path) -> list[Path]:
    """Same two-level walk as listModels, including directories it would skip."""
    if not model_dir.is_dir():
        return []
    found: list[Path] = []
    children = sorted(
        (p for p in model_dir.iterdir() if p.is_dir()),
        key=lambda p: p.name.lower(),
    )
    for child in children:
        found.append(child)
        has_model_file = (child / "config.yaml").is_file() or (
            child / "ensemble.yaml"
        ).is_file()
        if has_model_file:
            continue
        for grandchild in sorted(
            (p for p in child.iterdir() if p.is_dir()), key=lambda p: p.name.lower()
        ):
            found.append(grandchild)
    return found


def _validate_one_model(model_path: Path, views: list[str]) -> FileCheck:
    rel = model_path.name if model_path.parent.name else model_path.name
    issues: list[str] = []
    if _MODEL_NAME_RE.fullmatch(model_path.name) is None:
        issues.append(
            "Directory name must match the create-model rule "
            "(letters, digits, and . _ -)."
        )
    config = model_path / "config.yaml"
    ensemble = model_path / "ensemble.yaml"
    if config.is_file() and ensemble.is_file():
        issues.append("Has both config.yaml and ensemble.yaml.")
    elif config.is_file():
        try:
            yaml.safe_load(config.read_text())
        except Exception:
            issues.append("config.yaml is not valid YAML.")
    elif ensemble.is_file():
        try:
            yaml.safe_load(ensemble.read_text())
        except Exception:
            issues.append("ensemble.yaml is not valid YAML.")
    else:
        issues.append("Expected config.yaml or ensemble.yaml.")

    status_path = model_path / "train_status.json"
    if status_path.is_file():
        try:
            status_data = json.loads(status_path.read_text())
        except Exception:
            issues.append("train_status.json is not valid JSON.")
        else:
            if not isinstance(status_data, dict) or "status" not in status_data:
                issues.append("train_status.json is missing a status field.")

    preds = model_path / "video_preds"
    if preds.exists():
        if not preds.is_dir():
            issues.append("video_preds is not a directory.")
        else:
            unexpected: list[str] = []
            for child in sorted(preds.iterdir(), key=lambda p: p.name.lower()):
                if child.is_dir():
                    unexpected.append(f"Unexpected subdirectory: {child.name}")
                    continue
                if child.suffix != ".csv":
                    unexpected.append(f"Unexpected file in video_preds: {child.name}")
                    continue
                name_issue = _session_stem_issue(
                    child.stem, views, kind="prediction file"
                )
                if name_issue:
                    unexpected.append(f"{child.name}: {name_issue}")
            issues.extend(_cap(unexpected))
    return FileCheck(path=rel, issues=issues)


def calibration_file_issues(path: Path, views: list[str]) -> list[str]:
    """Load one calibration file and compare its camera names with the project views."""
    try:
        group = CameraGroup.load(str(path))
        names = [str(name) for name in group.get_names()]
    except Exception as exc:
        return [f"Could not read calibration: {exc}"]
    if views and names != views:
        return [
            "Camera names must match project views in order "
            f"({', '.join(views)}). Found {', '.join(names) or 'none'}."
        ]
    return []


def _validate_calibrations(
    project: Project,
) -> tuple[list[FileCheck], dict[str, dict]]:
    """Check calibration.toml and calibrations/*.toml. Backups are not listed."""
    data_dir = project.paths.data_dir
    views = list(project.config.view_names)
    context = _check_context(project)
    paths: list[Path] = []
    root_file = data_dir / "calibration.toml"
    if root_file.is_file():
        paths.append(root_file)
    cal_dir = data_dir / "calibrations"
    if cal_dir.is_dir():
        for child in sorted(cal_dir.iterdir(), key=lambda p: p.name.lower()):
            if child.is_file() and child.suffix == ".toml":
                paths.append(child)
    items: list[FileCheck] = []
    records: dict[str, dict] = {}
    for path in paths:
        rel = path.relative_to(data_dir).as_posix()
        issues = calibration_file_issues(path, views)
        items.append(FileCheck(path=rel, issues=issues))
        record = file_record(path, issues=issues, warnings=[], context=context, deps=[])
        if record is not None:
            records[rel] = record
    return items, records


def _validate_models(project: Project) -> tuple[list[FileCheck], dict[str, dict]]:
    model_dir = project.paths.model_dir
    views = list(project.config.view_names)
    context = _check_context(project)
    items: list[FileCheck] = []
    records: dict[str, dict] = {}
    for model_path in _walk_model_dirs(model_dir):
        check = _validate_one_model(model_path, views)
        check.path = model_path.relative_to(model_dir).as_posix()
        items.append(check)
        record = model_record(
            model_path, issues=check.issues, warnings=check.warnings, context=context
        )
        if record is not None:
            records[check.path] = record
    return items, records


@router.post("/app/v0/rpc/validateProjectFiles")
def validate_project_files(
    request: ValidateProjectFilesRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ValidateProjectFilesResponse:
    """Check one sector of the project and remember the results. Does not rewrite project files."""
    project: Project = project_info_getter(request.projectKey)
    items, records = _validate_sector(project, request.sector)
    replace_file_checks(project.paths.data_dir, request.sector, records)
    return ValidateProjectFilesResponse(items=items)


@router.post("/app/v0/rpc/cachedProjectFileChecks")
def cached_project_file_checks(
    request: ValidateProjectFilesRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ValidateProjectFilesResponse:
    """Return stored checks that still match the files. Stale paths are omitted."""
    project: Project = project_info_getter(request.projectKey)
    rows = fresh_file_checks(
        project.paths.data_dir,
        project.paths.model_dir,
        request.sector,
        list(project.config.view_names),
        list(project.config.keypoint_names),
    )
    return ValidateProjectFilesResponse(
        items=[FileCheck.model_validate(row) for row in rows]
    )


def _validate_sector(
    project: Project, sector: str
) -> tuple[list[FileCheck], dict[str, dict]]:
    if sector == "labels":
        return _validate_labels(project)
    if sector == "labeled-data":
        return _validate_labeled_data(project)
    if sector == "calibration":
        return _validate_calibrations(project)
    return _validate_models(project)
