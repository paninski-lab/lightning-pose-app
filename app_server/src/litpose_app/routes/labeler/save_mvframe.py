import asyncio
import os
import time
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from litpose_app import deps
from litpose_app.routes.project import ProjectInfo
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row

router = APIRouter()


class Keypoint(BaseModel):
    name: int
    x: float
    y: float


class SaveFrameViewRequest(BaseModel):
    csvPath: Path  # CollectedData_lTop.csv
    indexToChange: str  # labeled-data/session01_left/img001.png
    changedKeypoints: list[Keypoint]

    # If you want to remove a frame, you'd add a flag here to signal that intent.
    # For now, removal is not supported.


class SaveMvFrameRequest(BaseModel):
    views: list[SaveFrameViewRequest]


@router.post("/app/v0/rpc/save_mvframe")
async def save_mvframe(
    request: SaveMvFrameRequest, project_info: ProjectInfo = Depends(deps.project_info)
) -> None:
    """Endpoint for saving a multiview frame (in a multiview labels file)."""

    # Filter out views with no changed keypoints.
    request = request.model_copy()
    request.views = list(filter(lambda v: v.changedKeypoints, request.views))

    # Read files multithreaded and modify dataframes in memory.
    read_df_results = await read_df_mvframe(request)

    # Write to temp files multithreaded.
    write_tmp_results = await write_df_tmp_mvframe(
        request, read_df_results, project_info.data_dir
    )

    # Rename all files (atomic for each file).
    await commit_mvframe(request, write_tmp_results, project_info.data_dir)

    return


def _modify_df(df: pd.DataFrame, changes: SaveFrameViewRequest) -> None:
    """
    Given a dataframe with multicolumn index (scorer, bodypart, coordinate (x|y)),
    Modify the keypoints in the row at changes.index specified by changes.changedKeypoints.
    If the row doesn't exist (i.e. unlabeled frame) append to end of df.
    """
    kp_names = map(lambda x: x.name, changes.changedKeypoints)
    changedkps_by_name = {c.name: c for c in changes.changedKeypoints}
    columns = filter(
        lambda x: x[1] in kp_names and (x[2] in ["x", "y"]), df.columns.values
    )
    new_values = []
    for c in columns:
        changedkp = changedkps_by_name[c[1]]
        if c[2] == "x":
            new_values.append(changedkp.x)
        elif c[2] == "y":
            new_values.append(changedkp.y)
        else:
            raise AssertionError('columns were filtered for c[2] in ["x", "y"]')
    df.loc[changes.index, columns] = new_values


async def read_df_mvframe(request: SaveMvFrameRequest) -> list[pd.DataFrame]:
    def read_df_file_task(vr: SaveFrameViewRequest):
        df = pd.read_csv(vr.csvPath, header=[0, 1, 2], index_col=0)
        df = fix_empty_first_row(df)
        _modify_df(df, vr)
        return df

    result = []
    for v in request.views:
        r = run_in_threadpool(read_df_file_task, v)
        result.append(r)
    return await asyncio.gather(*result)


async def write_df_tmp_mvframe(
    request: SaveMvFrameRequest,
    read_df_results: list[pd.DataFrame],
    project_data_dir: Path,
) -> list[str]:
    """
    Writes the read_df_results to temporary files, prefixed with the original file name.
    """
    timestamp = time.time_ns()
    result = []

    def write_df_to_tmp_file(v: SaveFrameViewRequest, d: pd.DataFrame):
        tmp_file = project_data_dir / f"{v.csvPath.name}.{timestamp}.tmp"
        d.to_csv(tmp_file)
        return tmp_file

    for vr, df in zip(request.views, read_df_results):
        r = run_in_threadpool(write_df_to_tmp_file, vr, df)
        result.append(r)

    return await asyncio.gather(*result)


async def commit_mvframe(
    request: SaveMvFrameRequest, tmp_file_names: list[str], project_data_dir: Path
) -> None:
    """Renames temp files to their original names (atomic per file)."""

    def commit_changes():
        for vr, tmp_file_name in zip(request.views, tmp_file_names):
            dest_path = project_data_dir / vr.csvPath
            os.rename(tmp_file_name, dest_path)

    return await run_in_threadpool(commit_changes)
