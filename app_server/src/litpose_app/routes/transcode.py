import asyncio

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .files import super_rglob
from .project import ProjectInfo
from .. import deps
from ..tasks import transcode_fine

router = APIRouter()
from litpose_app.config import Config


@router.post("/app/v0/rpc/getFineVideoDir")
def get_fine_video_dir(config: Config = Depends(deps.config)):
    return {"path": config.FINE_VIDEO_DIR}


class GetFineVideoStatusRequest(BaseModel):
    name: str  # just the filename.


@router.post("/app/v0/rpc/getFineVideoStatus")
async def get_fine_video_status(
    request: GetFineVideoStatusRequest, config: Config = Depends(deps.config)
):
    """
    Either returns NotStarted, Done, or InProgress (with SSE ProgressStream)
    """
    return {"path": config.FINE_VIDEO_DIR}


@router.post("/app/v0/rpc/enqueueAllNewFineVideos")
async def enqueue_all_new_fine_videos(
    config: Config = Depends(deps.config),
    project_info: ProjectInfo = Depends(deps.project_info),
    scheduler: AsyncIOScheduler = Depends(deps.scheduler),
):
    # get all mp4 video files that are less than config.AUTO_TRANSCODE_VIDEO_SIZE_LIMIT_MB
    base_path = project_info.data_dir
    result = await asyncio.to_thread(super_rglob, base_path, pattern="*.mp4", stat=True)

    # Filter videos by size limit
    videos = [
        base_path / entry["path"]
        for entry in result
        if entry["size"]
        and entry["size"] < config.AUTO_TRANSCODE_VIDEO_SIZE_LIMIT_MB * 1000 * 1000
    ]

    # Create a transcode job per video.
    # The id of the job is just the filename. We assume unique video filenames
    # across the entire dataset.
    for path in videos:
        scheduler.add_job(
            transcode_fine.transcode_video_task,
            id=path.name,
            args=[path, config.FINE_VIDEO_DIR / path.name],
            executor="transcode_pool",
            # executor="debug",
            replace_existing=True,
            misfire_grace_time=None,
        )

    return "ok"
