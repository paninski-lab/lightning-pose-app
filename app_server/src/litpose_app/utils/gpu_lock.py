import json
import logging
import contextlib
from pathlib import Path
import portalocker

GPU_LOCK_PATH = "/tmp/litpose_gpu.lock"
GPU_TASK_PATH = "/tmp/litpose_gpu_task.json"

logger = logging.getLogger(__name__)


def _write_gpu_task(task_type: str, task_id: str, project_key: str | None = None) -> None:
    tmp = Path(GPU_TASK_PATH + ".tmp")
    data = {"type": task_type, "taskId": task_id}
    if project_key:
        data["projectKey"] = project_key
    tmp.write_text(json.dumps(data))
    tmp.rename(GPU_TASK_PATH)


def clear_gpu_task() -> None:
    try:
        Path(GPU_TASK_PATH).unlink(missing_ok=True)
    except Exception:
        pass


def read_gpu_task() -> dict | None:
    try:
        return json.loads(Path(GPU_TASK_PATH).read_text())
    except Exception:
        return None


def clear_stale_gpu_task() -> bool:
    """Attempts to clear the GPU task state if it's found to be stale.

    A task is considered stale if its metadata file exists but the corresponding
    OS-level GPU lock is not held by any process.

    Returns True if the state was cleared or didn't exist, False if it's currently active.
    """
    if not Path(GPU_TASK_PATH).exists():
        return True

    lock = portalocker.Lock(GPU_LOCK_PATH, mode="a", timeout=0)
    try:
        lock.acquire()
        try:
            # We acquired the lock, so any existing task info must be stale.
            # (No process currently holds the lock).
            clear_gpu_task()
            logger.info("Cleared stale GPU task info (OS lock was free)")
            return True
        finally:
            lock.release()
    except (portalocker.exceptions.LockException, portalocker.exceptions.AlreadyLocked):
        # Lock is currently held; the task is not stale.
        return False
    except Exception:
        # For other errors, don't clear (better to be safe).
        logger.exception("Failed to check for stale GPU task")
        return False


@contextlib.contextmanager
def gpu_lock_blocking(task_type: str, task_id: str, project_key: str | None = None):
    """Blocking GPU lock. Waits until acquired."""
    lock = portalocker.Lock(GPU_LOCK_PATH, mode="a", timeout=None)
    lock.acquire()
    try:
        _write_gpu_task(task_type, task_id, project_key=project_key)
        yield
    finally:
        clear_gpu_task()
        lock.release()


@contextlib.contextmanager
def gpu_lock_nonblocking(task_type: str, task_id: str, project_key: str | None = None):
    """Non-blocking GPU lock. Raises portalocker.LockException if busy."""
    lock = portalocker.Lock(GPU_LOCK_PATH, mode="a", timeout=0)
    lock.acquire()  # raises LockException if busy; no cleanup needed since lock wasn't held
    try:
        _write_gpu_task(task_type, task_id, project_key=project_key)
        yield lock
    finally:
        clear_gpu_task()
        lock.release()
