import json
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Optional
import sys
import portalocker
import psutil

from . import deps
from .routes.models import TrainStatus
from .utils.gpu_lock import gpu_lock_nonblocking, clear_gpu_task, read_gpu_task

logger = logging.getLogger(__name__)


def _is_pid_alive(pid: int) -> bool:
    """Checks if a process with the given PID is still alive.

    Uses psutil for a cross-platform check. On Unix-like systems, it explicitly
    checks for and attempts to reap zombie processes.
    """
    if pid is None:
        return False

    try:
        process = psutil.Process(pid)

        # On Unix-like systems, explicitly check for and handle zombie processes.
        # psutil.is_running() might return True for zombies in recent versions,
        # so we check status directly.
        if sys.platform != "win32":
            if process.status() == psutil.STATUS_ZOMBIE:
                logger.debug(f"Detected zombie process {pid}")
                try:
                    # Attempt to reap the zombie process.
                    # os.waitpid will clean up the zombie entry from the process table.
                    res_pid, status = os.waitpid(pid, os.WNOHANG)
                    if res_pid == pid:
                        logger.debug(f"Reaped zombie process {pid}")
                except ChildProcessError:
                    # This PID is not a child of the current process, so we can't reap it directly.
                    # It has likely been adopted by init. We still consider it not "alive" for our purpose.
                    pass
                except ProcessLookupError:
                    # PID already gone (e.g., reaped by another process or concurrent call).
                    pass
                except Exception as e:
                    logger.warning(
                        f"Error attempting to reap zombie process {pid}: {e}"
                    )
                return False  # A zombie process is not considered "alive" for active tasks.

        # If not a zombie (or on Windows where zombies don't exist), check if it's running.
        return process.is_running()

    except psutil.NoSuchProcess:
        # The PID does not exist at all, or it has terminated and been fully reaped.
        # On Unix, we can optionally attempt a final reap just in case, though it's less likely needed here.
        if sys.platform != "win32":
            try:
                res_pid, status = os.waitpid(pid, os.WNOHANG)
                if res_pid == pid:
                    logger.debug(f"Reaped terminated process {pid} after NoSuchProcess")
            except (ChildProcessError, ProcessLookupError):
                pass
            except Exception as e:
                logger.warning(f"Error during post-NoSuchProcess reap for {pid}: {e}")
        return False
    except psutil.AccessDenied:
        # Process exists but we don't have sufficient permissions to inspect it.
        # In this scenario, it's safer to assume the process is still active
        # to avoid accidentally launching another training session for it.
        logger.warning(
            f"Access denied when checking PID {pid} with psutil. "
            "Assuming process is alive to prevent double-launch."
        )
        return True
    except Exception as e:
        logger.exception(f"Unexpected error when checking PID {pid} with psutil: {e}")
        return False


def _read_status(path: Path) -> Optional[TrainStatus]:
    try:
        data = path.read_text()
        return TrainStatus.model_validate(json.loads(data))
    except Exception:
        return None


def _write_status(path: Path, status: TrainStatus) -> None:
    tmp = path.with_suffix(".tmp")
    with open(tmp, "x") as f:
        json.dump(status.model_dump(), f, indent=2)
    tmp.replace(path)


def _launch_training(model_dir: Path) -> subprocess.Popen:
    config_path = model_dir / "config.yaml"
    status_path = model_dir / "train_status.json"
    stdout_path = model_dir / "train_stdout.log"
    stderr_path = model_dir / "train_stderr.log"

    _write_status(status_path, TrainStatus(status="STARTING"))

    with open(stdout_path, "ab", buffering=0) as out, open(
        stderr_path, "ab", buffering=0
    ) as err:
        proc = subprocess.Popen(
            [
                "litpose",
                "train",
                str(config_path),
                "--output_dir",
                str(model_dir),
            ],
            stdout=out,
            stderr=err,
            cwd=str(model_dir),
        )

    _write_status(status_path, TrainStatus(status="STARTED", pid=proc.pid))
    logger.info("Launched training pid=%s for %s", proc.pid, model_dir)
    return proc


def train_scheduler_loop(poll_interval_seconds: float = 2.0) -> None:
    """Periodically checks for PENDING tasks and launches at most one training.

    Holds the GPU lock for the entire lifetime of the training subprocess so that
    inference tasks wait rather than running concurrently.
    """
    # GPU lock held across iterations while a training subprocess is alive.
    _gpu_lock_ctx = None
    _active_proc: Optional[subprocess.Popen] = None
    _active_model_dir: Optional[Path] = None

    while True:
        scheduler_lock_file = None
        try:
            # --- Check if our currently tracked subprocess has finished ---
            if _active_proc is not None:
                if not _is_pid_alive(_active_proc.pid):
                    logger.info(
                        "Training subprocess pid=%s finished for %s",
                        _active_proc.pid,
                        _active_model_dir,
                    )
                    if _gpu_lock_ctx is not None:
                        try:
                            _gpu_lock_ctx.__exit__(None, None, None)
                        except Exception as e:
                            logger.error("Error releasing GPU lock: %s", e)
                        _gpu_lock_ctx = None
                    _active_proc = None
                    _active_model_dir = None
                else:
                    # Training still running — GPU is in use, nothing to launch.
                    time.sleep(poll_interval_seconds)
                    continue

            project_util = deps.project_util(root_config=deps.root_config())
            pps = project_util.get_all_project_paths()
            for project_key, project_info in pps.items():
                if not (
                    project_info
                    and project_info.model_dir
                    and project_info.model_dir.exists()
                ):
                    continue

                base = project_info.model_dir
                lock_path = base / "scheduler.lock"

                try:
                    scheduler_lock_file = portalocker.Lock(
                        str(lock_path), mode="a", timeout=0
                    )
                    scheduler_lock_file.acquire()
                    logger.debug(f"Acquired scheduler lock on {lock_path}")
                except portalocker.exceptions.LockException:
                    logger.debug(
                        f"Another scheduler holds the lock on {lock_path}. Skipping."
                    )
                    continue

                # Mark any tasks whose process died as FAILED
                for d in [p for p in base.iterdir() if p.is_dir()]:
                    status_path = d / "train_status.json"
                    ts = _read_status(status_path)
                    if (
                        ts
                        and ts.status in ("STARTING", "STARTED", "TRAINING", "EVALUATING")
                        and ts.pid
                        and not _is_pid_alive(ts.pid)
                    ):
                        _write_status(status_path, TrainStatus(status="FAILED", pid=ts.pid))
                        logger.info("Marked %s as FAILED due to defunct PID %s", d.name, ts.pid)
                        # Also clear the GPU task if it matches this defunct task.
                        # This prevents the UI from showing a stuck active task after it failed.
                        defunct_task_id = f"train:{project_key}:{d.name}"
                        current_gpu_task = read_gpu_task()
                        if current_gpu_task and current_gpu_task.get("taskId") == defunct_task_id:
                            clear_gpu_task()
                            logger.info("Cleared stale GPU task info for defunct task %s", defunct_task_id)

                # Find first PENDING task
                pending_dirs = [
                    d for d in sorted(p for p in base.iterdir() if p.is_dir())
                    if (ts := _read_status(d / "train_status.json")) and ts.status == "PENDING"
                ]
                if not pending_dirs:
                    continue

                # Try to acquire the GPU lock (non-blocking — inference may be running)
                task_id = f"train:{project_key}:{pending_dirs[0].relative_to(base)}"
                try:
                    ctx = gpu_lock_nonblocking("training", task_id, project_key=project_key)
                    ctx.__enter__()
                except portalocker.exceptions.LockException:
                    logger.debug("GPU busy (inference running), will retry.")
                    continue

                proc = _launch_training(pending_dirs[0])
                _gpu_lock_ctx = ctx
                _active_proc = proc
                _active_model_dir = pending_dirs[0]
                logger.info("Launched training for %s", pending_dirs[0].name)
                break  # Only launch one task per cycle

        except Exception:
            logger.exception("Error in train scheduler loop")
        finally:
            if scheduler_lock_file:
                try:
                    scheduler_lock_file.release()
                    logger.debug("Released scheduler lock.")
                except Exception as e:
                    logger.error("Error releasing scheduler lock: %s", e)
            time.sleep(poll_interval_seconds)


def _train_scheduler_process_target():
    """Wrapper function to run train_scheduler_loop in a separate process."""
    # Configure logging for the child process.
    # This ensures logs from the child process are properly handled,
    # even if the main application's logging configuration changes.
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
    )
    child_logger = logging.getLogger(__name__)  # Use the same logger name

    child_logger.info("Train scheduler subprocess online.")
    try:
        train_scheduler_loop()
    except KeyboardInterrupt:
        # This can happen if the parent sends a SIGINT
        child_logger.info(
            "Train scheduler subprocess received KeyboardInterrupt, shutting down."
        )
    except Exception as e:
        child_logger.exception(
            "Train scheduler subprocess encountered an unhandled exception and is exiting."
        )
    finally:
        child_logger.info("Train scheduler subprocess exited.")


if __name__ == "__main__":
    _train_scheduler_process_target()
