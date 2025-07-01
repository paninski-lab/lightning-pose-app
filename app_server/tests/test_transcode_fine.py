import asyncio
from pathlib import Path

import httpx
import pytest
import reactivex
from apscheduler.executors.pool import ProcessPoolExecutor
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi.testclient import TestClient
from httpx import ASGITransport

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


@pytest.mark.asyncio
async def test_sse_stream_receives_event():
    """
    Tests the /sse endpoint.
    1. Connects a client to the SSE stream.
    2. Triggers an event by calling on_next() on the shared subject.
    3. Verifies that the client receives the event in the correct SSE format.
    4. Disconnects, implicitly testing the cleanup logic.
    """
    test_message = "This is a test message"

    app.state.num_active_transcode_tasks = subject = reactivex.Subject()

    # We use httpx.AsyncClient because it's designed to handle async requests
    # and streaming responses, which FastAPI's standard TestClient does not.
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        # The 'async with client.stream(...)' block opens a connection and
        # keeps it open until the block is exited. This simulates a real
        # SSE client connection.
        try:
            async with client.stream(
                "GET", "/app/v0/rpc/getFineVideoStatus"
            ) as response:
                # Ensure the connection was successful and headers are correct
                assert response.status_code == 200
                assert response.headers["content-type"] == "text/event-stream"

                # Give the server a brief moment to establish the subscription
                # within the event_generator.
                await asyncio.sleep(0.1)

                # Now, trigger an event from our test by pushing to the subject.
                # This simulates what the /trigger_event endpoint does.
                print(f"\n[TEST] Pushing message to subject: '{test_message}'")
                subject.on_next(test_message)

                # Read the first piece of data from the stream.
                # We use an async iterator to get data as it arrives.
                # The anext() function gets the next item from an async iterator.
                received_data = await anext(response.aiter_text())
                print(f"[TEST] Received data from stream: {received_data.strip()}")

                # Verify the received data is correctly formatted as an SSE message.
                # We check for the presence of the message, ignoring the timestamp
                # which is variable.
                assert f"data: {test_message}" in received_data

        except StopAsyncIteration:
            pytest.fail("Stream ended prematurely before receiving any data.")
        # When the `async with client.stream(...)` block exits, the connection
        # is closed. This implicitly triggers the `finally` block in the
        # `event_generator` on the server, which should dispose of the subscription.
        # The "Observable subscription disposed for a client." message should
        # appear in your server logs when running the test.
