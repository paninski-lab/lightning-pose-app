import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row
from litpose_app.routes.project import ProjectInfo
import pandas as pd
router = APIRouter()


class Keypoint(BaseModel):
    name: int
    x: float
    y: float


class SaveFrameViewRequest(BaseModel):
    csvPath: Path  # CollectedData_lTop.csv
    indexToChange: str # labeled-data/session01_left/img001.png
    changedKeypoints: list[Keypoint]

    # If you want to remove a frame, you'd add a flag here to signal that intent.
    # For now, removal is not supported.

class SaveMvFrameRequest(BaseModel):
    views: list[SaveFrameViewRequest]


@router.post("/app/v0/rpc/save_mvframe")
async def save_mvframe_stub(
    request: SaveMvFrameRequest, project_info: ProjectInfo = Depends(deps.project_info)
) -> None:
    """Endpoint for saving a multiview frame (in a multiview labels file)."""

    # let's think about what this is going to do...
    # For each file we're going to parse it to validate

    # then we're going to update the df row at that index
    # if it does not exist, we'll add it to bottom.

    # read_df.then modify. then wait for all success. then write to tmp file. then wait for all success. then rename.
    read_df_results =  await read_df_mvframe(request)

    write_df_tmp_futures = write_df_tmp_mvframe(read_df_results)
    await asyncio.gather(*write_df_tmp_futures)

    commit_mvframe_futures = commit_mvframe(read_df_results)
    await asyncio.gather(*commit_mvframe_futures)

    return

from starlette.concurrency import run_in_threadpool

async def read_df_mvframe(request: SaveMvFrameRequest) -> list[asyncio.Future]:
    def read_df_file_task(vr: SaveFrameViewRequest):
        df = pd.read_csv(vr.csvPath, header=[0,1,2], index_col=0)
        df = fix_empty_first_row(df)
        # modify, then...
        return df

    result = []
    for v in request.views:
        r = run_in_threadpool(read_df_file_task, v)
        result.append(r)
    return await asyncio.gather(*result)

def write_df_tmp_mvframe(read_df_futures: list[asyncio.Future]) -> list[asyncio.Future]:
    pass

def commit_mvframe(read_df_futures: list[asyncio.Future]) -> list[asyncio.Future]:
    pass

