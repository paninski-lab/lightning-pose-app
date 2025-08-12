from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.routes.project import ProjectInfo

router = APIRouter()


class Keypoint(BaseModel):
    name: int
    x: float
    y: float


class SaveFrameViewRequest(BaseModel):
    csvPath: Path
    changedKeypoints: list[Keypoint]


class SaveMvFrameRequest(BaseModel):
    views: list[SaveFrameViewRequest]


@router.post("/app/v0/rpc/save_mvframe")
async def save_mvframe_stub(
    request: SaveMvFrameRequest, project_info: ProjectInfo = Depends(deps.project_info)
):
    """Stub endpoint for saving a multiview frame.

    This is a placeholder and will be implemented later.
    """
    return {"status": "stub", "detail": "save_mvframe not implemented yet"}
