"""RPC endpoint for saving multi-view keypoint labels to CSV files.

One save writes every view's label CSV and unlabeled sidecar as a unit: all
new files are staged and checked first, then committed with
``replace_files``, which restores the originals if any step fails.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from starlette.concurrency import run_in_threadpool

from litpose_app import deps
from litpose_app.datatypes import Project
from litpose_app.deps import ProjectInfoGetter
from litpose_app.project_cache import drop_file_check, relative_data_path
from litpose_app.utils.file_transaction import replace_files
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row
from litpose_app.utils.mv_label_file import label_files_lock, queue_frame_path

router = APIRouter()
lock = asyncio.Lock()


logger = logging.getLogger(__name__)


class Keypoint(BaseModel):
    """A keypoint with name and pixel coordinates; None over the wire becomes NaN."""

    name: str

    # null over the wire. Converts to float("nan") due to field validator below
    x: float
    y: float

    @field_validator("x", "y", mode="before")
    def _normalize_to_nan(cls, v: float | None) -> float:
        """Convert None to NaN before validation."""
        if v is None:
            return float("nan")
        return v


class SaveFrameViewRequest(BaseModel):
    """Keypoint edits for one view's label CSV: which frame to update and how."""

    csvPath: Path  # /home/user/.../CollectedData_lTop.csv
    indexToChange: str  # labeled-data/session01_left/img001.png
    changedKeypoints: list[Keypoint]
    delete: bool = False

    # If you want to remove a frame, you'd add a flag here to signal that intent.
    # For now, removal is not supported.


class SaveMvFrameRequest(BaseModel):
    """Request to save keypoint changes across all views for a single multi-view frame."""

    projectKey: str
    views: list[SaveFrameViewRequest]
    unlabeledQueueDeletionOnly: bool = False


@router.post("/app/v0/rpc/save_mvframe")
async def save_mvframe(
    request: SaveMvFrameRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> None:
    """
    Endpoint for saving a multiview frame (in a multiview labels file).
    Global lock: Only one execution allowed at a time.
    """
    async with lock:
        project: Project = project_info_getter(request.projectKey)
        await run_in_threadpool(_save_mvframe_sync, request, project.paths.data_dir)


def _save_mvframe_sync(request: SaveMvFrameRequest, data_dir: Path) -> None:
    """Stage every changed CSV and sidecar, then commit them together."""
    views = request.views
    if not request.unlabeledQueueDeletionOnly:
        # Only views with changed keypoints are written.
        views = [v for v in views if v.changedKeypoints or v.delete]
        if not views:
            return

    stamp = time.time_ns()
    with label_files_lock:
        staged: list[tuple[Path, Path]] = []
        try:
            if not request.unlabeledQueueDeletionOnly:
                for vr in views:
                    staged.append((_stage_csv(vr, stamp), vr.csvPath))
            for vr in views:
                tmp = _stage_sidecar_removal(vr, stamp)
                if tmp is not None:
                    staged.append((tmp, _sidecar_path(vr)))
        except BaseException:
            for tmp, _ in staged:
                tmp.unlink(missing_ok=True)
            raise

        try:
            replace_files(staged)
        finally:
            if not request.unlabeledQueueDeletionOnly:
                for vr in views:
                    rel = relative_data_path(data_dir, vr.csvPath)
                    if rel is not None:
                        drop_file_check(data_dir, "labels", rel)


def _modify_df(df: pd.DataFrame, changes: SaveFrameViewRequest) -> None:
    """
    Given a dataframe with multicolumn index (scorer, bodypart, coordinate (x|y)),
    Modify the keypoints in the row at changes.index specified by changes.changedKeypoints.
    If the row doesn't exist (i.e. unlabeled frame) append to end of df.
    """
    if changes.delete:
        df.drop(changes.indexToChange, inplace=True)
        return
    kp_names = set(map(lambda x: x.name, changes.changedKeypoints))
    bodyparts = {column[1] for column in df.columns.values}
    missing = sorted(kp_names - bodyparts)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                "These keypoints are not columns in the label file: "
                + ", ".join(missing)
                + ". Recreate the label file so its columns match the project keypoints."
            ),
        )
    changedkps_by_name = {c.name: c for c in changes.changedKeypoints}
    columns = list(
        filter(lambda x: x[1] in kp_names and (x[2] in ["x", "y"]), df.columns.values)
    )
    logger.debug(kp_names)
    logger.debug(df.columns.values)
    new_values = []
    for c in columns:
        changedkp = changedkps_by_name[c[1]]
        if c[2] == "x":
            new_values.append(changedkp.x)
        elif c[2] == "y":
            new_values.append(changedkp.y)
        else:
            raise AssertionError('columns were filtered for c[2] in ["x", "y"]')
    logger.debug(changes.indexToChange)
    logger.debug(columns)
    logger.debug(new_values)
    df.loc[changes.indexToChange, columns] = new_values


def _stage_csv(vr: SaveFrameViewRequest, stamp: int) -> Path:
    """Write the view's updated CSV next to it and check it reads back the same."""
    df = pd.read_csv(vr.csvPath, header=[0, 1, 2], index_col=0)
    df = fix_empty_first_row(df)
    _modify_df(df, vr)
    tmp = vr.csvPath.with_name(f"{vr.csvPath.name}.{stamp}.tmp")
    try:
        df.to_csv(tmp)
        _check_staged_csv(tmp, df)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return tmp


def _check_staged_csv(tmp: Path, expected: pd.DataFrame) -> None:
    """Raise if the staged CSV does not have the rows and columns that were written."""
    staged = fix_empty_first_row(pd.read_csv(tmp, header=[0, 1, 2], index_col=0))
    if list(staged.index) != list(expected.index) or list(staged.columns) != list(
        expected.columns
    ):
        raise RuntimeError(f"Staged label file does not match what was written: {tmp}")


def _sidecar_path(vr: SaveFrameViewRequest) -> Path:
    return vr.csvPath.with_suffix(".unlabeled.jsonl")


def _stage_sidecar_removal(vr: SaveFrameViewRequest, stamp: int) -> Path | None:
    """Stage the view's unlabeled sidecar without the saved frame.

    Returns the temp file, or None when the sidecar is missing or has no entry
    for the frame. Blank lines are skipped. See utils/mv_label_file.py for adding.
    """
    sidecar = _sidecar_path(vr)
    if not sidecar.exists():
        return None
    lines = [
        json.loads(line) for line in sidecar.read_text().splitlines() if line.strip()
    ]
    saved = queue_frame_path(vr.indexToChange)
    kept = [
        line
        for line in lines
        if queue_frame_path(str(line.get("frame_path", ""))) != saved
    ]
    if len(kept) == len(lines):
        return None
    tmp = sidecar.with_name(f"{sidecar.name}.{stamp}.tmp")
    try:
        tmp.write_text("\n".join(json.dumps(line) for line in kept) + "\n")
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return tmp
