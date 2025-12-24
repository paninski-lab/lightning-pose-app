import copy
import hashlib
import json
import logging
import math
import os
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..datatypes import Project
from .. import deps
from ..deps import ProjectInfoGetter

logger = logging.getLogger(__name__)
router = APIRouter()


# -----------------------------
# Singletons
# -----------------------------
_executor: Optional[ThreadPoolExecutor] = None
_status_lock = threading.RLock()
_futures_by_task: Dict[str, Future] = {}


def get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        cpu = os.cpu_count() or 2
        workers = max(1, math.ceil(cpu / 10))
        _executor = ThreadPoolExecutor(
            max_workers=workers, thread_name_prefix="model-infer"
        )
    return _executor


# -----------------------------
# Status tracking
# -----------------------------


class InferenceStatus(str):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    DONE = "DONE"
    ERROR = "ERROR"


@dataclass
class InferenceTaskStatus:
    taskId: str
    status: str = InferenceStatus.PENDING
    completed: int | None = None
    total: int | None = None
    error: str | None = None
    message: str | None = None


_status_by_task: Dict[str, InferenceTaskStatus] = {}


def _get_or_create_status_nolock(task_id: str) -> InferenceTaskStatus:
    s = _status_by_task.get(task_id)
    if s is None:
        s = InferenceTaskStatus(taskId=task_id)
        _status_by_task[task_id] = s
    return s


def get_or_create_status(task_id: str) -> InferenceTaskStatus:
    with _status_lock:
        s = _get_or_create_status_nolock(task_id)
    return copy.deepcopy(s)


def set_status(task_id: str, **kwargs):
    with _status_lock:
        st = _get_or_create_status_nolock(task_id)
        for k, v in kwargs.items():
            setattr(st, k, v)


def _status_snapshot_dict(task_id: str) -> dict:
    st = get_or_create_status(task_id)
    return asdict(st)


def _stream_sse_sync(gen: Iterator[dict]):
    for payload in gen:
        data = json.dumps(payload)
        yield f"data: {data}\n\n"


# -----------------------------
# Helpers
# -----------------------------
def _task_id_for(model_dir: Path, videos: list[Path]) -> str:
    h = hashlib.sha1()
    h.update(str(model_dir.resolve()).encode())
    for v in sorted(videos, key=lambda p: str(p.resolve())):
        h.update(b"\0")
        h.update(str(v.resolve()).encode())
    return h.hexdigest()[:16]


def _start_inference_background(task_id: str, model_dir: Path, video_paths: list[Path]):
    # If already running, return existing future
    with _status_lock:
        fut = _futures_by_task.get(task_id)
        if fut is not None and not fut.done():
            return fut

    run_dir = model_dir / "inference" / task_id
    run_dir.mkdir(parents=True, exist_ok=True)
    progress_path = run_dir / "progress.json"

    # Initialize status (short duration so tests don't hang)
    TOTAL_STEPS = 5
    set_status(
        task_id,
        status=InferenceStatus.ACTIVE,
        error=None,
        completed=0,
        total=TOTAL_STEPS,
    )

    def _run():
        try:
            import subprocess
            import sys

            """
            code = (
                "import time, json, sys, pathlib;"
                "p = pathlib.Path(sys.argv[1]);"
                "total = 5;"
                "\nfor i in range(total+1):\n"
                "    p.write_text(json.dumps({'completed': i, 'total': total}));\n"
                "    time.sleep(0.1)\n"
            )
            cmd = [sys.executable, "-c", code, str(progress_path)]
            """
            cmd = [
                "litpose",
                "predict",
                model_dir,
                *[str(p) for p in video_paths],
                "--progress_file",
                str(progress_path),
                "--skip_viz",
            ]
            process = subprocess.Popen(cmd)

            # Poll progress file periodically while process runs
            last_completed = 0
            while True:
                # Update from file if present
                try:
                    if progress_path.exists():
                        raw = progress_path.read_text()
                        data = json.loads(raw)
                        completed = int(data.get("completed", last_completed))
                        total = int(data.get("total", TOTAL_STEPS))
                        last_completed = completed
                        set_status(
                            task_id,
                            completed=completed,
                            total=total,
                            message=f"{completed}/{total}",
                        )
                except Exception:
                    # best-effort read; ignore malformed intermediate writes
                    pass

                # Check process state
                ret = process.poll()
                if ret is not None:
                    if ret == 0:
                        set_status(task_id, status=InferenceStatus.DONE)
                    else:
                        set_status(
                            task_id,
                            status=InferenceStatus.ERROR,
                            error=f"Mock inference failed with code {ret}",
                        )
                    break

                time.sleep(0.25)
        except Exception as e:
            set_status(task_id, status=InferenceStatus.ERROR, error=f"Exception: {e}")

    future = get_executor().submit(_run)
    with _status_lock:
        _futures_by_task[task_id] = future
    return future


# -----------------------------
# Routes
# -----------------------------
@router.get("/app/v0/sse/InferModel")
def infer_model(
    projectKey: str,
    modelRelativePath: str,
    videoRelativePaths: list[str] = Query(default=[]),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
):
    """Start or attach to a mock model inference and stream progress via SSE.

    This mirrors the TranscodeVideo pattern: a GET request both triggers a
    background task and subscribes to its status via Server-Sent Events (SSE).

    Query Parameters
    - projectKey: Project identifier used to resolve paths.
    - modelRelativePath: directory name under project.paths.model_dir
    - videoRelativePaths: list of paths under the project data directory
      (provide multiple query params with the same name)
    """
    project: Project = project_info_getter(projectKey)

    # Resolve and validate model directory
    if project.paths.model_dir is None:
        raise HTTPException(
            status_code=400, detail="Project model_dir is not configured."
        )
    model_dir = (Path(project.paths.model_dir) / modelRelativePath).resolve()
    try:
        model_dir.relative_to(project.paths.model_dir)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid modelRelativePath.")
    if not model_dir.exists():
        raise HTTPException(status_code=404, detail="Model directory not found.")

    # Resolve and validate video paths (best-effort; they may not need to exist)
    data_base = Path(project.paths.data_dir)
    resolved_videos: list[Path] = []
    for rel in videoRelativePaths:
        p = (data_base / rel).resolve()
        try:
            p.relative_to(data_base)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid video path: {rel}")
        resolved_videos.append(p)

    if not resolved_videos:
        # Allow empty list, but warn in logs
        logger.info("InferModel called with empty video list for %s", model_dir)

    task_id = _task_id_for(model_dir, resolved_videos)

    # Start background mock inference
    _start_inference_background(task_id, model_dir, resolved_videos)

    def poller_sync() -> Iterator[dict]:

        while True:
            payload = _status_snapshot_dict(task_id)
            yield payload
            if payload["status"] in (InferenceStatus.DONE, InferenceStatus.ERROR):
                break
            time.sleep(0.1)

    return StreamingResponse(
        _stream_sse_sync(poller_sync()), media_type="text/event-stream"
    )
