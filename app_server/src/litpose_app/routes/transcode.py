import asyncio
import json
from typing import AsyncGenerator

import reactivex
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from reactivex import Observable
import reactivex.operators

from .files import super_rglob
from .project import ProjectInfo
from .. import deps
from ..tasks import transcode_fine
import logging

logger = logging.getLogger(__name__)
router = APIRouter()
from litpose_app.config import Config


@router.post("/app/v0/rpc/getFineVideoDir")
def get_fine_video_dir(config: Config = Depends(deps.config)):
    return {"path": config.FINE_VIDEO_DIR}


@router.get("/app/v0/rpc/getFineVideoStatus")
async def get_fine_video_status(request: Request) -> StreamingResponse:
    """
    Returns number of pending transcode tasks.
    """
    subject: reactivex.Subject = request.app.state.num_active_transcode_tasks
    wrapped = subject.pipe(reactivex.operators.map(lambda x: {"pending": x}))
    return await sse_events(request, wrapped)


@router.post("/app/v0/rpc/enqueueAllNewFineVideos")
async def enqueue_all_new_fine_videos(
    config: Config = Depends(deps.config),
    project_info: ProjectInfo = Depends(deps.project_info),
    scheduler: AsyncIOScheduler = Depends(deps.scheduler),
):
    # get all mp4 video files that are less than config.AUTO_TRANSCODE_VIDEO_SIZE_LIMIT_MB
    base_path = project_info.data_dir
    result = await asyncio.to_thread(
        super_rglob, base_path, pattern="**/*.mp4", stat=True
    )

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


async def sse_events(request: Request, source: Observable) -> StreamingResponse:
    # An asyncio.Queue will act as a bridge between the synchronous world of
    # the RxPy observable and the async world of the FastAPI response.
    queue = asyncio.Queue()

    # The scheduler ensures that the observable runs on the asyncio event loop,
    # which is necessary for it to work correctly with FastAPI.
    scheduler = AsyncIOScheduler()

    async def event_generator() -> AsyncGenerator[str, None]:
        """
        This async generator function is the core of the SSE streaming.
        It listens for items on the queue and yields them in the SSE format.
        """
        disposable = None
        try:
            # Subscribe to the observable.
            # For each item emitted by the observable (`on_next`), we put it
            # into our asyncio queue.
            # If the observable completes (`on_completed`) or errors (`on_error`),
            # we put a special sentinel value (None) in the queue to signal the end.
            disposable = source.subscribe(
                on_next=lambda item: queue.put_nowait(item),
                on_error=lambda e: queue.put_nowait(None),
                on_completed=lambda: queue.put_nowait(None),
                scheduler=scheduler,
            )

            while True:
                # Check if the client has disconnected.
                if await request.is_disconnected():
                    logger.debug("Client disconnected.")
                    break

                # Wait for an item to appear on the queue.
                item = await queue.get()

                # If the item is our sentinel value, it means the observable
                # has finished, and we can stop streaming.
                if item is None:
                    break

                # Yield the data in the Server-Sent Event format.
                # The format is "data: {your_message}\n\n"
                yield f"data: {json.dumps(item)}\n\n"

        finally:
            # This block is crucial for cleanup. It runs when the client
            # disconnects or the stream is otherwise closed.
            # We dispose of the subscription to the observable, which stops
            # the interval and prevents memory leaks.
            if disposable:
                disposable.dispose()
                logger.debug("Observable subscription disposed.")
            logger.debug("Event generator finished.")

    return StreamingResponse(event_generator(), media_type="text/event-stream")
