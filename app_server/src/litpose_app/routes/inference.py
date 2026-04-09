import copy
import hashlib
import json
import logging
import math
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterator, List, Optional

import yaml
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


# -----------------------------
# EKS Inference
# -----------------------------

def _derive_sessions(video_paths: List[Path], view_names: List[str]) -> List[str]:
    """Derive unique session keys from video paths by stripping camera name suffixes."""
    sessions: List[str] = []
    seen: set = set()
    for vp in video_paths:
        stem = vp.stem  # filename without extension
        session = stem
        for cam in view_names:
            if stem.endswith(f"_{cam}"):
                session = stem[: -len(f"_{cam}")]
                break
        if session not in seen:
            seen.add(session)
            sessions.append(session)
    return sessions


def _run_member_inference(member_dir: Path, video_paths: List[Path]) -> bool:
    """Run litpose predict on a single member model. Returns True on success."""
    cmd = [
        "litpose",
        "predict",
        str(member_dir),
        *[str(p) for p in video_paths],
        "--skip_viz",
    ]
    process = subprocess.Popen(cmd)
    ret = process.wait()
    return ret == 0


def _start_eks_inference_background(
    task_id: str,
    eks_model_dir: Path,
    member_dirs: List[Path],
    video_paths: List[Path],
    ensemble_config: dict,
):
    with _status_lock:
        fut = _futures_by_task.get(task_id)
        if fut is not None and not fut.done():
            return fut

    n_members = len(member_dirs)
    # total = one step per member + one EKS step per session
    view_names: List[str] = ensemble_config.get("view_names", [])
    sessions = _derive_sessions(video_paths, view_names)
    n_sessions = max(len(sessions), 1)
    total_steps = n_members + n_sessions

    set_status(
        task_id,
        status=InferenceStatus.ACTIVE,
        error=None,
        completed=0,
        total=total_steps,
    )

    def _run():
        try:
            # Step 1: run litpose predict on each member model
            for i, member_dir in enumerate(member_dirs):
                set_status(
                    task_id,
                    message=f"Running inference on member {i + 1}/{n_members}: {member_dir.name}",
                )
                ok = _run_member_inference(member_dir, video_paths)
                if not ok:
                    set_status(
                        task_id,
                        status=InferenceStatus.ERROR,
                        error=f"litpose predict failed for member model: {member_dir.name}",
                    )
                    return
                set_status(task_id, completed=i + 1)

            # Step 2: run EKS smoother for each session
            smooth_param: float = ensemble_config.get("smooth_param", 1000.0)
            quantile_keep_pca: float = ensemble_config.get("quantile_keep_pca", 50.0)
            eks_video_preds_dir = eks_model_dir / "video_preds"
            eks_video_preds_dir.mkdir(parents=True, exist_ok=True)

            eks_script = Path(__file__).parent.parent / "scripts" / "run_eks.py"

            for s_idx, session in enumerate(sessions):
                set_status(
                    task_id,
                    message=f"Running EKS smoother for session {s_idx + 1}/{n_sessions}: {session}",
                )

                # Gather input files: for each member, for each camera
                input_files: List[str] = []
                for member_dir in member_dirs:
                    for cam in view_names:
                        pred_file = member_dir / "video_preds" / f"{session}_{cam}.csv"
                        if not pred_file.exists():
                            set_status(
                                task_id,
                                status=InferenceStatus.ERROR,
                                error=f"Missing prediction file: {pred_file}",
                            )
                            return
                        input_files.append(str(pred_file))

                cmd = [
                    sys.executable,
                    str(eks_script),
                    "--save_dir", str(eks_video_preds_dir),
                    "--camera_names", *view_names,
                    "--smooth_param", str(smooth_param),
                    "--quantile_keep_pca", str(quantile_keep_pca),
                    "--input_files", *input_files,
                ]
                process = subprocess.Popen(cmd)
                ret = process.wait()
                if ret != 0:
                    set_status(
                        task_id,
                        status=InferenceStatus.ERROR,
                        error=f"EKS smoother failed with exit code {ret} for session: {session}",
                    )
                    return

                set_status(task_id, completed=n_members + s_idx + 1)

            set_status(task_id, status=InferenceStatus.DONE, completed=total_steps)

        except Exception as e:
            set_status(task_id, status=InferenceStatus.ERROR, error=f"Exception: {e}")

    future = get_executor().submit(_run)
    with _status_lock:
        _futures_by_task[task_id] = future
    return future


@router.get("/app/v0/sse/InferEksModel")
def infer_eks_model(
    projectKey: str,
    modelRelativePath: str,
    videoRelativePaths: list[str] = Query(default=[]),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
):
    """Start or attach to EKS inference and stream progress via SSE.

    Runs litpose predict on each member model, then runs the EKS smoother
    and saves smoothed predictions to the EKS model's video_preds/ directory.
    """
    project: Project = project_info_getter(projectKey)

    if project.paths.model_dir is None:
        raise HTTPException(status_code=400, detail="Project model_dir is not configured.")

    # Resolve and validate EKS model directory
    eks_model_dir = (Path(project.paths.model_dir) / modelRelativePath).resolve()
    try:
        eks_model_dir.relative_to(project.paths.model_dir)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid modelRelativePath.")
    if not eks_model_dir.exists():
        raise HTTPException(status_code=404, detail="EKS model directory not found.")

    ensemble_path = eks_model_dir / "ensemble.yaml"
    if not ensemble_path.is_file():
        raise HTTPException(status_code=400, detail="Not an EKS model (ensemble.yaml missing).")

    try:
        ensemble_config = yaml.safe_load(ensemble_path.read_text())
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse ensemble.yaml.")

    # Resolve member model directories
    members = ensemble_config.get("members", [])
    member_dirs: List[Path] = []
    for m in members:
        member_dir = (Path(project.paths.model_dir) / m["id"]).resolve()
        try:
            member_dir.relative_to(project.paths.model_dir)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid member id: {m['id']}")
        if not member_dir.exists():
            raise HTTPException(status_code=404, detail=f"Member model directory not found: {m['id']}")
        member_dirs.append(member_dir)

    if not member_dirs:
        raise HTTPException(status_code=400, detail="EKS model has no members.")

    # Resolve video paths
    data_base = Path(project.paths.data_dir)
    resolved_videos: List[Path] = []
    for rel in videoRelativePaths:
        p = (data_base / rel).resolve()
        try:
            p.relative_to(data_base)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid video path: {rel}")
        resolved_videos.append(p)

    if not resolved_videos:
        logger.info("InferEksModel called with empty video list for %s", eks_model_dir)

    task_id = _task_id_for(eks_model_dir, resolved_videos)

    _start_eks_inference_background(task_id, eks_model_dir, member_dirs, resolved_videos, ensemble_config)

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
