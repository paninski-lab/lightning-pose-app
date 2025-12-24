import json
import logging
import re
import threading
import math
import os
from concurrent.futures import ThreadPoolExecutor, Future
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional, Iterator
import copy

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..datatypes import Project
from litpose_app.rootconfig import RootConfig

from .. import deps
from ..deps import ProjectInfoGetter
from ..tasks import transcode_fine

logger = logging.getLogger(__name__)
router = APIRouter()


# -----------------------------
# Filename parsing/validation
# -----------------------------
ALLOWED_FILENAME_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


def parse_session_view(filename: str) -> tuple[str, str, str]:
    """Parse filename of form session_view.ext and validate rules.

    Returns (session, view, ext)
    """
    if not ALLOWED_FILENAME_RE.match(filename):
        raise HTTPException(status_code=400, detail="Invalid filename characters.")
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename path components.")
    stem, dot, ext = filename.rpartition(".")
    if dot == "":
        raise HTTPException(
            status_code=400, detail="Filename must include an extension."
        )
    if "_" not in stem:
        raise HTTPException(
            status_code=400,
            detail="Filename must be of the form session_view.ext",
        )
    session, _, view = stem.rpartition("_")
    if not session or not view:
        raise HTTPException(status_code=400, detail="Invalid session/view in filename.")
    return session, view, ext


# -----------------------------
# Paths and singletons
# -----------------------------
def uploads_dir(root_config: RootConfig) -> Path:
    d = root_config.LP_SYSTEM_DIR / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def videos_dir_for_project(project: Project) -> Path:
    d = project.paths.data_dir / "videos"
    d.mkdir(parents=True, exist_ok=True)
    return d


_executor: Optional[ThreadPoolExecutor] = None
_status_lock = threading.RLock()
_futures_by_file: Dict[str, Future] = {}


def get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        # Modest default; ffmpeg itself is multi-core. Keep pool small.
        cpu = os.cpu_count() or 2
        transcode_workers = max(1, math.ceil(cpu / 10))
        _executor = ThreadPoolExecutor(
            max_workers=transcode_workers, thread_name_prefix="video-transcode"
        )
    return _executor


# -----------------------------
# Status tracking
# -----------------------------


class TranscodeStatus(str):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    DONE = "DONE"
    ERROR = "ERROR"


@dataclass
class VideoTaskStatus:
    filename: str
    transcodeStatus: str = TranscodeStatus.PENDING
    framesDone: int | None = None
    totalFrames: int | None = None
    error: str | None = None


_status_by_file: Dict[str, VideoTaskStatus] = {}


def _get_or_create_status_nolock(filename: str) -> VideoTaskStatus:
    """Internal helper. Caller must hold _status_lock."""
    s = _status_by_file.get(filename)
    if s is None:
        s = VideoTaskStatus(filename=filename)
        _status_by_file[filename] = s
    return s


def get_or_create_status(filename: str) -> VideoTaskStatus:
    """Return a snapshot copy of the current status (thread‑safe).

    The returned object is a deep copy, so callers must not mutate it expecting
    global state to change; use ``set_status`` for updates.
    """
    with _status_lock:
        s = _get_or_create_status_nolock(filename)

    return copy.deepcopy(s)


def set_status(filename: str, **kwargs):
    with _status_lock:
        st = _get_or_create_status_nolock(filename)
        for k, v in kwargs.items():
            setattr(st, k, v)


def _status_snapshot_dict(filename: str) -> dict:
    """Return a thread-safe snapshot dict of the current status for filename."""
    # Use the deepcopying accessor and convert to dict for SSE/JSON responses.
    st = get_or_create_status(filename)
    return asdict(st)


# -----------------------------
# Models
# -----------------------------
class GetVideoStatusRequest(BaseModel):
    filename: str


class GetVideoStatusResponse(BaseModel):
    transcodeStatus: str
    framesDone: int | None = None
    totalFrames: int | None = None
    error: str | None = None


# -----------------------------
# Helpers
# -----------------------------
def _atomic_save(dst: Path, src_file: UploadFile):
    """Atomically save an uploaded file to destination path.

    Writes to a temporary file alongside the destination and then moves it into
    place to avoid partially written results on failure.
    """
    tmp = dst.with_suffix(dst.suffix + ".tmp")
    with tmp.open("xb") as out:
        # Copy in chunks to satisfy type checkers and keep memory usage modest
        while True:
            chunk = src_file.file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    tmp.replace(dst)


def _ffprobe_total_frames(path: Path) -> Optional[int]:
    try:
        import subprocess

        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-count_frames",
            "-show_entries",
            "stream=nb_read_frames",
            "-of",
            "default=nokey=1:noprint_wrappers=1",
            str(path),
        ]
        res = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        if res.returncode != 0:
            return None
        value = res.stdout.strip()
        return int(value) if value.isdigit() else None
    except Exception:
        return None


def _stream_sse_sync(gen: Iterator[dict]):
    """Wrap a sync iterator of dict payloads into SSE text events.

    Yields lines formatted as Server-Sent Events where each payload is JSON
    serialized and emitted as a single `data: ...` event followed by a blank line.
    """
    for payload in gen:
        data = json.dumps(payload)
        yield f"data: {data}\n\n"


def _start_transcode_background(filename: str, input_path: Path, output_path: Path):
    # If already running, return existing future
    with _status_lock:
        fut = _futures_by_file.get(filename)
        if fut is not None and not fut.done():
            return fut

    # Compute total frames once
    total = _ffprobe_total_frames(input_path)
    set_status(
        filename, totalFrames=total, transcodeStatus=TranscodeStatus.ACTIVE, error=None
    )

    def _run():
        try:
            import subprocess

            cmd = [
                "ffmpeg",
                "-i",
                str(input_path),
                *transcode_fine.FFMPEG_OPTIONS,
                "-y",
                str(output_path),
            ]
            process = subprocess.Popen(
                cmd,
                # FFmpeg logs progress info and errors to stderr, stdout is not needed
                stderr=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                text=True,
            )
            frames_done_local = 0
            assert process.stderr is not None
            for line in process.stderr:
                print(f"ffmpeg[{threading.get_ident()}]: {line}", end="")
                if "frame=" in line:
                    m = re.search(r"frame=\s*(\d+)", line)
                    if m:
                        frames_done_local = int(m.group(1))
                        set_status(filename, framesDone=frames_done_local)

            # Ensure process has finished if wait() is available (mock Popen may not implement it)
            try:
                process.wait()
            except AttributeError:
                pass
            if process.returncode == 0 and output_path.exists():
                set_status(
                    filename,
                    transcodeStatus=TranscodeStatus.DONE,
                    framesDone=frames_done_local,
                )
                # Cleanup the uploaded file
                try:
                    input_path.unlink()
                except FileNotFoundError:
                    pass
            else:
                set_status(
                    filename,
                    transcodeStatus=TranscodeStatus.ERROR,
                    error=f"FFmpeg failed with code {process.returncode}",
                )
        except Exception as e:
            # Ensure terminal state on unexpected errors (e.g., ffmpeg missing)
            set_status(
                filename,
                transcodeStatus=TranscodeStatus.ERROR,
                error=f"Exception during transcode: {e}",
            )

    executor = get_executor()
    future = executor.submit(_run)
    with _status_lock:
        _futures_by_file[filename] = future
    return future


# -----------------------------
# Routes
# -----------------------------
@router.post("/app/v0/rpc/UploadVideo")
def upload_video(
    projectKey: str = Form(...),
    filename: str = Form(...),
    should_overwrite: bool = Form(False),
    file: UploadFile = File(...),
    root_config: RootConfig = Depends(deps.root_config),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
):
    """Upload a single video file to the server's uploads directory.

    This endpoint accepts a browser-style multipart/form-data upload. The file
    is written atomically to `~/.lightning-pose/uploads/<filename>` and the
    in-memory task status is updated to mark the upload as DONE.

    Parameters
    - projectKey: Project identifier used to validate the project exists.
    - filename: Must be of the form `session_view.ext` with allowed characters.
    - should_overwrite: If false and a file already exists at the destination,
      the request fails with 409. If true, it will overwrite.
    - file: The uploaded file.

    Returns
    - JSON object `{ "ok": true }` on success.

    Errors
    - 400: Invalid filename format or characters.
    - 409: File exists and `should_overwrite` is false.
    """
    # Validate project exists (also used to set videos dir later)
    _ = project_info_getter(projectKey)
    # Validate filename
    parse_session_view(filename)

    # Determine upload path
    dst = root_config.UPLOADS_DIR / filename
    if dst.exists() and not should_overwrite:
        raise HTTPException(
            status_code=409,
            detail="File already exists. Set should_overwrite to replace.",
        )
    try:
        _atomic_save(dst, file)
    finally:
        file.file.close()

    return {"ok": True}


@router.post("/app/v0/rpc/GetVideoStatus")
def get_video_status(
    request: GetVideoStatusRequest,
    root_config: RootConfig = Depends(deps.root_config),
) -> GetVideoStatusResponse:
    """Get the current upload/transcode status for a given filename.

    Parameters
    - request: JSON body `{ "filename": "session_view.ext" }`.

    Returns
    - `GetVideoStatusResponse` including `transcodeStatus`,
      `framesDone`, `totalFrames`, and optional `error` string.
    """
    st = get_or_create_status(request.filename)
    return GetVideoStatusResponse(
        transcodeStatus=st.transcodeStatus,
        framesDone=st.framesDone,
        totalFrames=st.totalFrames,
        error=st.error,
    )


@router.get("/app/v0/sse/TranscodeVideo")
def transcode_video(
    projectKey: str,
    filename: str,
    should_overwrite: bool = False,
    root_config: RootConfig = Depends(deps.root_config),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
):
    """Start or attach to a background transcode and stream progress via SSE.

    This endpoint starts a background ffmpeg transcode of the previously
    uploaded file `~/.lightning-pose/uploads/<filename>` into the project
    videos directory `<project.data_dir>/videos/<filename>`. Progress events
    are streamed as Server-Sent Events (SSE), each event being a JSON
    serialization of the current `VideoTaskStatus` for the filename.

    Query Parameters
    - projectKey: Project identifier used to resolve the output videos folder.
    - filename: Name of the uploaded file to transcode.
    - should_overwrite: If false and output exists, a single DONE event is
      emitted immediately without starting a new transcode.

    Event payload shape
    - `{ "transcodeStatus": "PENDING|ACTIVE|DONE|ERROR", "framesDone": int|null, "totalFrames": int|null, "error": str|null }`

    Behavior
    - If the output already exists and overwrite is false, emits one DONE event.
    - Otherwise, launches a single background task per filename and polls
      status periodically until reaching DONE or ERROR. On success, the
      uploaded source file is removed.
    """
    project: Project = project_info_getter(projectKey)
    # Validate filename (prevents path traversal)
    parse_session_view(filename)

    in_path = root_config.UPLOADS_DIR / filename
    if not in_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Uploaded file not found. Upload before transcoding.",
        )

    out_dir = videos_dir_for_project(project)
    out_path = out_dir / filename
    if out_path.exists() and not should_overwrite:
        # Already done – mark and return a single DONE event
        set_status(
            filename,
            transcodeStatus=TranscodeStatus.DONE,
        )

        def _single_sync() -> Iterator[dict]:
            # Ensure upload status reflects disk state, then return a snapshot
            yield _status_snapshot_dict(filename)

        return StreamingResponse(
            _stream_sse_sync(_single_sync()), media_type="text/event-stream"
        )

    # Ensure parent exists
    out_dir.mkdir(parents=True, exist_ok=True)

    # Start background transcode if needed
    _start_transcode_background(filename, in_path, out_path)

    def poller_sync() -> Iterator[dict]:
        # Periodically emit current status until terminal
        import time

        while True:
            payload = _status_snapshot_dict(filename)
            yield payload
            if payload["transcodeStatus"] in (
                TranscodeStatus.DONE,
                TranscodeStatus.ERROR,
            ):
                break
            time.sleep(0.25)

    return StreamingResponse(
        _stream_sse_sync(poller_sync()), media_type="text/event-stream"
    )


# -----------------------------
# Startup cleanup
# -----------------------------
def cleanup_old_uploads(rc: RootConfig):
    """Delete uploads older than 24 hours in the system uploads directory.

    Runs at application startup as a best-effort maintenance task. Any
    exceptions during individual file deletions are ignored to avoid blocking
    app startup.
    """
    cutoff = datetime.now() - timedelta(hours=24)
    try:
        for p in rc.UPLOADS_DIR.glob("*"):
            try:
                mtime = datetime.fromtimestamp(p.stat().st_mtime)
                if mtime < cutoff:
                    p.unlink(missing_ok=True)
            except Exception:
                # best-effort cleanup
                continue
    except Exception:
        logger.exception("Failed to cleanup old uploads directory")
