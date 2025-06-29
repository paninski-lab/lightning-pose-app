from pathlib import Path

from apscheduler.executors.pool import ProcessPoolExecutor
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi.testclient import TestClient

from litpose_app import deps
from litpose_app.config import Config
from litpose_app.main import app


def in_memory_scheduler():
    test_jobstores = {"default": MemoryJobStore()}
    test_process_pool_executor = ProcessPoolExecutor(max_workers=2)
    test_scheduler = AsyncIOScheduler(
        jobstores=test_jobstores, executor=test_process_pool_executor
    )

    # TestClient side-effect: Runs the app lifespan, around the ac.
    # Remember that app lifespan is responsible for starting and stopping the scheduler.

    return test_scheduler


def test_enqueue_all_new_fine_videos(monkeypatch):

    # Make the app get our local in-memory scheduler.
    scheduler = in_memory_scheduler()
    monkeypatch.setattr(deps, "scheduler", lambda: scheduler)

    c = Config()
    c.FINE_VIDEO_DIR = (
        Path("..") / "lightning-pose" / "data" / "mirror-mouse-example" / "videos"
    )

    with TestClient(app) as c:
        assert scheduler.running  # make sure the app is using our local scheduler.
        response = c.post("/app/v0/rpc/enqueueAllNewFineVideos", json={})

    # Check that the request was successful
    assert response.status_code == 200
