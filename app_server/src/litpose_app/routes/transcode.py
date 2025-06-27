from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..tasks import transcode_fine

router = APIRouter()
from litpose_app.config import FINE_VIDEO_DIR


@router.post("/app/v0/rpc/getFineVideoDir")
def get_fine_video_dir():
    return {"path": FINE_VIDEO_DIR}


class GetFineVideoStatusRequest(BaseModel):
    name: str  # just the filename.


@router.post("/app/v0/rpc/getFineVideoStatus")
async def get_fine_video_status(request: GetFineVideoStatusRequest):
    """
    Either returns NotStarted, Done, or InProgress (with SSE ProgressStream)
    """
    return {"path": FINE_VIDEO_DIR}
