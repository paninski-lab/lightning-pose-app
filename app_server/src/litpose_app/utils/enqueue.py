import asyncio
import logging

from .. import deps
from ..routes.rglob import _rglob
from ..tasks import transcode_fine

logger = logging.getLogger(__name__)


async def enqueue_all_new_fine_videos_task() -> None:
    """
    Resolve dependencies and invoke the enqueue logic to schedule fine video transcodes.

    This is the canonical entry point to enqueue fine video transcodes from places
    outside of request handlers (e.g., on startup) or from routes (via background tasks).
    """
    try:
        config = deps.config()
        project_info = deps.project_info(config)
        scheduler = deps.scheduler()

        # get all mp4 video files that are less than config.AUTO_TRANSCODE_VIDEO_SIZE_LIMIT_MB
        base_path = project_info.data_dir
        result = await asyncio.to_thread(
            _rglob, base_path, pattern="**/*.mp4", stat=True
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
    except Exception:
        logger.exception("Failed to enqueue fine video transcode tasks.")
