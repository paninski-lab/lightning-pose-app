import json
import contextlib
from pathlib import Path
import portalocker

GPU_LOCK_PATH = "/tmp/litpose_gpu.lock"
GPU_TASK_PATH = "/tmp/litpose_gpu_task.json"


def _write_gpu_task(task_type: str, task_id: str) -> None:
    tmp = Path(GPU_TASK_PATH + ".tmp")
    tmp.write_text(json.dumps({"type": task_type, "taskId": task_id}))
    tmp.rename(GPU_TASK_PATH)


def _clear_gpu_task() -> None:
    try:
        Path(GPU_TASK_PATH).unlink(missing_ok=True)
    except Exception:
        pass


def read_gpu_task() -> dict | None:
    try:
        return json.loads(Path(GPU_TASK_PATH).read_text())
    except Exception:
        return None


@contextlib.contextmanager
def gpu_lock_blocking(task_type: str, task_id: str):
    """Blocking GPU lock. Waits until acquired."""
    lock = portalocker.Lock(GPU_LOCK_PATH, mode="a", timeout=None)
    lock.acquire()
    try:
        _write_gpu_task(task_type, task_id)
        yield
    finally:
        _clear_gpu_task()
        lock.release()


@contextlib.contextmanager
def gpu_lock_nonblocking(task_type: str, task_id: str):
    """Non-blocking GPU lock. Raises portalocker.LockException if busy."""
    lock = portalocker.Lock(GPU_LOCK_PATH, mode="a", timeout=0)
    lock.acquire()  # raises LockException if busy; no cleanup needed since lock wasn't held
    try:
        _write_gpu_task(task_type, task_id)
        yield lock
    finally:
        _clear_gpu_task()
        lock.release()
