from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import List

import pandas as pd

from litpose_app.config import Config
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row
from .models import SaveMvFrameRequest, SaveFrameViewRequest
from .project import get_project_info

_lock = threading.Lock()


def _validate_view_paths(views: List[SaveFrameViewRequest], data_dir: Path) -> None:
    for vr in views:
        p = Path(vr.csvPath).resolve()
        try:
            p.relative_to(data_dir)
        except Exception:
            raise AssertionError("Invalid csvPath")
        if p.suffix != ".csv":
            raise AssertionError("Invalid suffix for csvPath; expected .csv")


def _modify_df(df: pd.DataFrame, changes: SaveFrameViewRequest) -> None:
    # Column filtering by keypoint names and x|y
    kp_names = {c.name for c in changes.changedKeypoints}
    columns = [c for c in df.columns.values if (c[1] in kp_names and c[2] in ("x", "y"))]

    # Build new values in column order
    changed_by_name = {c.name: c for c in changes.changedKeypoints}

    new_values: list[float] = []
    for c in columns:
        changed = changed_by_name[c[1]]
        if c[2] == "x":
            val = float("nan") if changed.x is None else float(changed.x)
            new_values.append(val)
        elif c[2] == "y":
            val = float("nan") if changed.y is None else float(changed.y)
            new_values.append(val)

    # Assign; if row doesn't exist, pandas will create it
    df.loc[changes.indexToChange, columns] = new_values


def _read_and_modify(vr: SaveFrameViewRequest) -> pd.DataFrame:
    df = pd.read_csv(vr.csvPath, header=[0, 1, 2], index_col=0)
    df = fix_empty_first_row(df)
    _modify_df(df, vr)
    return df


def _write_tmp(vr: SaveFrameViewRequest, df: pd.DataFrame) -> Path:
    ts = time.time_ns()
    tmp = Path(vr.csvPath).with_name(f"{Path(vr.csvPath).name}.{ts}.tmp")
    df.to_csv(tmp)
    return tmp


def _commit(request: SaveMvFrameRequest, tmp_paths: List[Path]) -> None:
    for vr, tmp in zip(request.views, tmp_paths):
        os.replace(tmp, vr.csvPath)


def _remove_from_unlabeled_sidecar_files(request: SaveMvFrameRequest) -> None:
    ts = time.time_ns()
    for vr in request.views:
        unlabeled = Path(vr.csvPath).with_suffix(".unlabeled")
        if not unlabeled.exists():
            continue
        lines = unlabeled.read_text().splitlines()
        needs_save = False
        while vr.indexToChange in lines:
            lines.remove(vr.indexToChange)
            needs_save = True
        if needs_save:
            tmp = unlabeled.with_name(f"{unlabeled.name}.{ts}.tmp")
            tmp.write_text("\n".join(lines) + "\n")
            os.replace(tmp, unlabeled)


def save_mvframe_logic(request: SaveMvFrameRequest, config: Config) -> str:
    """Business logic for saving multiview frame edits atomically across files."""
    project_info = get_project_info(config).projectInfo
    if project_info.data_dir is None:
        raise FileNotFoundError("Active project has no data_dir configured")

    # Filter out views with no changed keypoints
    req = request.model_copy(deep=True)
    # FastAPI to Flask migration: convert relative paths to absolute paths
    for v in req.views:
        v.csvPath = project_info.data_dir / v.csvPath
    req.views = [v for v in req.views if v.changedKeypoints]
    if not req.views:
        return "ok"

    data_dir = Path(project_info.data_dir)
    _validate_view_paths(req.views, data_dir)

    with _lock:
        # Read/modify dataframes
        dfs = [_read_and_modify(vr) for vr in req.views]
        # Write to tmp
        tmps = [_write_tmp(vr, df) for vr, df in zip(req.views, dfs)]
        # Atomically rename
        _commit(req, tmps)
        # Update unlabeled sidecar files
        _remove_from_unlabeled_sidecar_files(req)

    return "ok"
