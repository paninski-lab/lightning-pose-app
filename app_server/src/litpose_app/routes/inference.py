import copy
import json
import logging
import math
import os
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, Iterator, List, Optional

import yaml
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


@dataclass
class InferenceTaskStatus:
    taskId: str
    status: str = InferenceStatus.PENDING
    completed: int | None = None
    total: int | None = None
    error: str | None = None
    message: str | None = None
    logs: List[str] = field(default_factory=list)


_status_by_task: Dict[str, InferenceTaskStatus] = {}
# Ordered list of task IDs so we can find the most recent one
_task_id_order: List[str] = []


def _get_or_create_status_nolock(task_id: str) -> InferenceTaskStatus:
    s = _status_by_task.get(task_id)
    if s is None:
        s = InferenceTaskStatus(taskId=task_id)
        _status_by_task[task_id] = s
        _task_id_order.append(task_id)
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
    d = asdict(st)
    # Hydrate logs from the log buffer (status object doesn't store them)
    d["logs"] = _get_logs(task_id)
    return d


def _stream_sse_sync(gen: Iterator[dict]):
    for payload in gen:
        data = json.dumps(payload)
        yield f"data: {data}\n\n"


# -----------------------------
# Log buffer
# -----------------------------

_logs_by_task: Dict[str, List[str]] = {}
_logs_lock = threading.RLock()


def _append_log(task_id: str, line: str):
    with _logs_lock:
        _logs_by_task.setdefault(task_id, []).append(line)


def _get_logs(task_id: str, from_offset: int = 0) -> List[str]:
    with _logs_lock:
        return list(_logs_by_task.get(task_id, [])[from_offset:])


# -----------------------------
# Subprocess helper
# -----------------------------

def _run_subprocess_with_logging(task_id: str, cmd: List[str]) -> int:
    """Run a subprocess, capturing stdout/stderr into the task log buffer. Returns exit code."""
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    def _reader(pipe, prefix: str):
        for line in iter(pipe.readline, ''):
            stripped = line.rstrip('\n')
            if stripped:
                _append_log(task_id, f"{prefix}{stripped}")
        pipe.close()

    t_out = threading.Thread(target=_reader, args=(proc.stdout, ''), daemon=True)
    t_err = threading.Thread(target=_reader, args=(proc.stderr, '[stderr] '), daemon=True)
    t_out.start()
    t_err.start()
    ret = proc.wait()
    t_out.join()
    t_err.join()
    return ret


# -----------------------------
# Plan data structures
# -----------------------------

@dataclass
class InferStep:
    kind: str  # 'normal', 'member', 'eks'
    model_dir: Path
    session: str
    video_paths: List[Path]
    member_of: Optional[Path] = None          # parent EKS model dir, for kind='member'
    member_dirs: List[Path] = field(default_factory=list)   # for kind='eks'
    ensemble_config: dict = field(default_factory=dict)     # for kind='member' and 'eks'


@dataclass
class InferPlan:
    steps: List[InferStep]
    skipped_count: int


# -----------------------------
# Session / video helpers
# -----------------------------

def _derive_sessions(video_paths: List[Path], view_names: List[str]) -> List[str]:
    """Derive unique session keys from video paths by stripping camera name suffixes."""
    sessions: List[str] = []
    seen: set = set()
    for vp in video_paths:
        stem = vp.stem
        session = stem
        for cam in view_names:
            if stem.endswith(f"_{cam}"):
                session = stem[: -len(f"_{cam}")]
                break
        if session not in seen:
            seen.add(session)
            sessions.append(session)
    return sessions


def _session_to_videos(data_dir: Path, view_names: List[str]) -> Dict[str, List[Path]]:
    """Map session name → list of video paths by globbing data_dir."""
    result: Dict[str, List[Path]] = {}
    for vp in data_dir.glob("videos*/**/*.mp4"):
        stem = vp.stem
        session = stem
        for cam in view_names:
            if stem.endswith(f"_{cam}"):
                session = stem[: -len(f"_{cam}")]
                break
        result.setdefault(session, []).append(vp)
    return result


def _all_view_preds_exist(model_dir: Path, session: str, view_names: List[str]) -> bool:
    """Return True if all expected prediction CSVs already exist for this model/session."""
    preds_dir = model_dir / "video_preds"
    if view_names:
        return all((preds_dir / f"{session}_{cam}.csv").exists() for cam in view_names)
    return (preds_dir / f"{session}.csv").exists()


# -----------------------------
# Plan builder
# -----------------------------

def _build_infer_plan(
    project: Project,
    model_relative_paths: List[str],
    sessions: List[str],
    video_relative_paths: Optional[List[str]] = None,
    force: bool = False,
) -> InferPlan:
    """
    Build an ordered, skip-filtered list of inference steps.

    If video_relative_paths is provided, sessions are derived from those paths.
    If sessions == ["all"], all videos in data_dir are discovered.
    Otherwise sessions is treated as a list of session names.
    """
    view_names: List[str] = list(project.config.view_names or [])
    model_base = Path(project.paths.model_dir)
    data_base = Path(project.paths.data_dir)

    # Resolve models into normal and EKS
    normal_model_dirs: List[Path] = []
    eks_models: List[tuple] = []  # (model_dir, ensemble_config)

    for rel in model_relative_paths:
        model_dir = (model_base / rel).resolve()
        ensemble_path = model_dir / "ensemble.yaml"
        if ensemble_path.is_file():
            try:
                ensemble_config = yaml.safe_load(ensemble_path.read_text()) or {}
            except Exception:
                ensemble_config = {}
            eks_models.append((model_dir, ensemble_config))
        else:
            normal_model_dirs.append(model_dir)

    # Compute session → video paths mapping
    if video_relative_paths:
        explicit_videos = [(data_base / rel).resolve() for rel in video_relative_paths]
        target_sessions = _derive_sessions(explicit_videos, view_names)
        sess_to_vids: Dict[str, List[Path]] = {}
        for vp in explicit_videos:
            stem = vp.stem
            session = stem
            for cam in view_names:
                if stem.endswith(f"_{cam}"):
                    session = stem[: -len(f"_{cam}")]
                    break
            sess_to_vids.setdefault(session, []).append(vp)
    else:
        sess_to_vids = _session_to_videos(data_base, view_names)
        target_sessions = list(sess_to_vids.keys()) if sessions == ["all"] else sessions

    steps: List[InferStep] = []
    skipped_count = 0
    seen_member_keys: set = set()

    # Pass 1: normal models
    for model_dir in normal_model_dirs:
        for session in target_sessions:
            if not force and _all_view_preds_exist(model_dir, session, view_names):
                skipped_count += 1
            else:
                steps.append(InferStep(
                    kind="normal",
                    model_dir=model_dir,
                    session=session,
                    video_paths=sess_to_vids.get(session, []),
                ))

    # Pass 1 (continued): member models required by EKS models
    for eks_model_dir, ensemble_config in eks_models:
        ens_views: List[str] = ensemble_config.get("view_names", view_names)
        members = ensemble_config.get("members", [])
        member_dirs = [(model_base / m["id"]).resolve() for m in members]

        for session in target_sessions:
            for member_dir in member_dirs:
                key = (member_dir, session)
                if key in seen_member_keys:
                    continue
                seen_member_keys.add(key)
                if not force and _all_view_preds_exist(member_dir, session, ens_views):
                    skipped_count += 1
                else:
                    steps.append(InferStep(
                        kind="member",
                        model_dir=member_dir,
                        session=session,
                        video_paths=sess_to_vids.get(session, []),
                        member_of=eks_model_dir,
                        ensemble_config=ensemble_config,
                    ))

    # Pass 2: EKS smoother steps
    for eks_model_dir, ensemble_config in eks_models:
        ens_views = ensemble_config.get("view_names", view_names)
        members = ensemble_config.get("members", [])
        member_dirs = [(model_base / m["id"]).resolve() for m in members]

        for session in target_sessions:
            if not force and _all_view_preds_exist(eks_model_dir, session, ens_views):
                skipped_count += 1
            else:
                steps.append(InferStep(
                    kind="eks",
                    model_dir=eks_model_dir,
                    session=session,
                    video_paths=sess_to_vids.get(session, []),
                    member_dirs=member_dirs,
                    ensemble_config=ensemble_config,
                ))

    return InferPlan(steps=steps, skipped_count=skipped_count)


# -----------------------------
# Execution
# -----------------------------

def _run_eks_step(task_id: str, step: InferStep) -> bool:
    """Run EKS smoother for a single (model, session) pair. Returns True on success."""
    ensemble_config = step.ensemble_config
    view_names: List[str] = ensemble_config.get("view_names", [])
    smooth_param: float = ensemble_config.get("smooth_param", 1000.0)
    quantile_keep_pca: float = ensemble_config.get("quantile_keep_pca", 50.0)

    eks_video_preds_dir = step.model_dir / "video_preds"
    eks_video_preds_dir.mkdir(parents=True, exist_ok=True)
    eks_script = Path(__file__).parent.parent / "scripts" / "run_eks.py"

    input_files: List[str] = []
    for member_dir in step.member_dirs:
        for cam in view_names:
            pred_file = member_dir / "video_preds" / f"{step.session}_{cam}.csv"
            if not pred_file.exists():
                set_status(
                    task_id,
                    status=InferenceStatus.FAILED,
                    error=f"Missing prediction file: {pred_file}",
                )
                return False
            input_files.append(str(pred_file))

    cmd = [
        sys.executable, str(eks_script),
        "--save_dir", str(eks_video_preds_dir),
        "--camera_names", *view_names,
        "--smooth_param", str(smooth_param),
        "--quantile_keep_pca", str(quantile_keep_pca),
        "--input_files", *input_files,
    ]
    ret = _run_subprocess_with_logging(task_id, cmd)
    if ret != 0:
        set_status(
            task_id,
            status=InferenceStatus.FAILED,
            error=f"EKS smoother failed for {step.model_dir.name} on {step.session}",
        )
        return False
    return True


def _start_batch_inference_background(task_id: str, plan: InferPlan) -> Future:
    with _status_lock:
        fut = _futures_by_task.get(task_id)
        if fut is not None and not fut.done():
            return fut

    steps = plan.steps
    total = len(steps)
    set_status(task_id, status=InferenceStatus.RUNNING, completed=0, total=total, error=None)

    def _run():
        try:
            for i, step in enumerate(steps):
                msg = (
                    f"Step {i + 1}/{total}: {step.kind} — "
                    f"{step.model_dir.name} on {step.session}"
                )
                set_status(task_id, message=msg)
                _append_log(task_id, f"=== {msg} ===")

                if step.kind in ("normal", "member"):
                    predict_wrapper = (
                        Path(__file__).parent.parent
                        / "utils" / "inference" / "predict_wrapper.py"
                    )
                    cmd = [
                        sys.executable, str(predict_wrapper),
                        str(step.model_dir),
                        *[str(p) for p in step.video_paths],
                        "--skip_viz",
                    ]
                    ret = _run_subprocess_with_logging(task_id, cmd)
                    if ret != 0:
                        set_status(
                            task_id,
                            status=InferenceStatus.FAILED,
                            error=(
                                f"litpose predict failed for {step.model_dir.name} "
                                f"on {step.session}"
                            ),
                        )
                        return
                else:
                    if not _run_eks_step(task_id, step):
                        return
                set_status(task_id, completed=i + 1)

            set_status(task_id, status=InferenceStatus.COMPLETED, completed=total)
            _append_log(task_id, "=== Inference completed ===")
        except Exception as e:
            set_status(task_id, status=InferenceStatus.FAILED, error=f"Exception: {e}")
            _append_log(task_id, f"[error] Exception: {e}")

    future = get_executor().submit(_run)
    with _status_lock:
        _futures_by_task[task_id] = future
    return future


# -----------------------------
# Request / response models
# -----------------------------

class InferTaskRequest(BaseModel):
    projectKey: str
    models: List[str]
    sessions: List[str]
    videoRelativePaths: List[str] = []
    force: bool = False


class ResolveRequest(BaseModel):
    projectKey: str
    models: List[str]
    sessions: List[str]
    videoRelativePaths: List[str] = []


# -----------------------------
# Validation helper
# -----------------------------

def _validate_model_paths(project: Project, model_relative_paths: List[str]):
    if project.paths.model_dir is None:
        raise HTTPException(status_code=400, detail="Project model_dir is not configured.")
    model_base = Path(project.paths.model_dir)
    for rel in model_relative_paths:
        model_dir = (model_base / rel).resolve()
        try:
            model_dir.relative_to(model_base)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid model path: {rel}")
        if not model_dir.exists():
            raise HTTPException(status_code=404, detail=f"Model directory not found: {rel}")


# -----------------------------
# Routes
# -----------------------------

@router.post("/app/v0/inference/task")
def start_inference_task(
    req: InferTaskRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
):
    """Start a background inference task and return its task ID."""
    project: Project = project_info_getter(req.projectKey)
    _validate_model_paths(project, req.models)

    plan = _build_infer_plan(
        project,
        req.models,
        req.sessions,
        video_relative_paths=req.videoRelativePaths or None,
        force=req.force,
    )
    task_id = str(uuid.uuid4())
    _start_batch_inference_background(task_id, plan)
    return {"taskId": task_id, "status": "ACCEPTED"}


@router.get("/app/v0/inference/task/active")
def get_active_inference_task():
    """Return the taskId of the most recent non-terminal task, or null."""
    terminal = {InferenceStatus.COMPLETED, InferenceStatus.FAILED, InferenceStatus.CANCELLED}
    with _status_lock:
        for task_id in reversed(_task_id_order):
            st = _status_by_task.get(task_id)
            if st is not None and st.status not in terminal:
                return {"taskId": task_id}
    return {"taskId": None}


@router.get("/app/v0/inference/task/{taskId}")
def get_inference_task_status(taskId: str):
    """Get the current status of an inference task, including all log lines so far."""
    return _status_snapshot_dict(taskId)


@router.get("/app/v0/inference/task/{taskId}/stream")
def stream_inference_task(taskId: str):
    """Stream real-time status updates and log lines for an inference task via SSE."""
    terminal = {InferenceStatus.COMPLETED, InferenceStatus.FAILED, InferenceStatus.CANCELLED}

    def poller() -> Iterator[dict]:
        log_offset = 0

        # Replay all logs accumulated before the subscriber connected
        initial_logs = _get_logs(taskId, 0)
        if initial_logs:
            yield {"type": "log", "lines": initial_logs}
            log_offset = len(initial_logs)

        while True:
            snapshot = _status_snapshot_dict(taskId)
            # Don't include the full logs list in SSE status events — too large
            snapshot.pop("logs", None)
            snapshot["type"] = "status"
            yield snapshot

            new_lines = _get_logs(taskId, log_offset)
            if new_lines:
                yield {"type": "log", "lines": new_lines}
                log_offset += len(new_lines)

            if snapshot["status"] in terminal:
                # Final flush in case lines arrived after the last poll
                final_lines = _get_logs(taskId, log_offset)
                if final_lines:
                    yield {"type": "log", "lines": final_lines}
                break

            time.sleep(0.1)

    return StreamingResponse(_stream_sse_sync(poller()), media_type="text/event-stream")


@router.post("/app/v0/inference/resolve")
def resolve_inference(
    req: ResolveRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
):
    """Preview which inference steps would execute for a given request."""
    project: Project = project_info_getter(req.projectKey)
    _validate_model_paths(project, req.models)

    plan = _build_infer_plan(
        project,
        req.models,
        req.sessions,
        video_relative_paths=req.videoRelativePaths or None,
        force=False,
    )
    model_base = Path(project.paths.model_dir)
    runs = []
    for step in plan.steps:
        try:
            model_rel = str(step.model_dir.relative_to(model_base))
        except ValueError:
            model_rel = str(step.model_dir)
        run: dict = {"model": model_rel, "session": step.session, "kind": step.kind}
        if step.member_of is not None:
            try:
                run["member_of"] = str(step.member_of.relative_to(model_base))
            except ValueError:
                run["member_of"] = str(step.member_of)
        runs.append(run)
    return {"runs": runs, "skipped_count": plan.skipped_count}
