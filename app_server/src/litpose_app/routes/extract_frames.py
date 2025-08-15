import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from .. import deps
from ..tasks.extract_frames import extract_frames_task, Session, MVLabelFile

logger = logging.getLogger(__name__)
router = APIRouter()
from litpose_app.config import Config


@router.post("/app/v0/rpc/getFineVideoDir")
def get_fine_video_dir(config: Config = Depends(deps.config)):
    return {"path": config.FINE_VIDEO_DIR}


class ExtractFramesRequest(BaseModel):
    session: Session
    label_file: MVLabelFile


@router.post("/app/v0/rpc/extractFrames")
async def extract_frames(
    request: ExtractFramesRequest,
):
    config = deps.config()
    project_info = deps.project_info(config)
    scheduler = deps.scheduler()

    def on_progress(x):
        logger.info(f"extractFrames progress: {x}")

    await run_in_threadpool(
        extract_frames_task, config, request.session, request.label_file, on_progress
    )

    return "ok"
