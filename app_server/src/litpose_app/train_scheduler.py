import json
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Optional
import sys  # Import sys to check the platform
import portalocker  # Import the portalocker library
import psutil  # Import the psutil library

from . import deps
from .routes.models import TrainStatus

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


def _launch_training(model_dir: Path) -> None:
    """Launch a dummy training script that updates status and writes logs.

    In real usage, this would call the actual training script.
    """
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
                str(model_dir.parent),
            ],
            stdout=out,
            stderr=err,
            cwd=str(model_dir),
        )

    _write_status(status_path, TrainStatus(status="STARTED", pid=proc.pid))

    logger.info("Launched training pid=%s for %s", proc.pid, model_dir)


def train_scheduler_loop(poll_interval_seconds: float = 2.0) -> None:
    """Periodically checks for PENDING tasks and launches at most one training."""
    while True:
        lock_file = None
        try:
            config = deps.config()
            if not config.PROJECT_INFO_TOML_PATH.exists():
                continue
            project_info = deps.project_info(config)
            if (
                project_info
                and project_info.model_dir
                and project_info.model_dir.exists()
            ):
                base = project_info.model_dir
                lock_path = base / "scheduler.lock"

                try:
                    # Use portalocker.Lock to acquire an exclusive non-blocking lock
                    # mode='a' is important to avoid truncating existing lock files on some platforms
                    # timeout=0 means non-blocking
                    lock_file = portalocker.Lock(str(lock_path), mode="a", timeout=0)
                    lock_file.acquire()
                    logger.debug(f"Acquired lock on {lock_path}")
                except portalocker.exceptions.LockException:
                    logger.debug(
                        f"Another scheduler holds the lock on {lock_path}. Skipping this cycle."
                    )
                    continue  # Skip this cycle if lock cannot be acquired

                active_found = False
                for d in [p for p in base.iterdir() if p.is_dir()]:
                    status_path = d / "train_status.json"
                    ts = _read_status(status_path)
                    if (
                        ts
                        and ts.status
                        in ("STARTING", "STARTED", "TRAINING", "EVALUATING")
                        and ts.pid
                    ):
                        if _is_pid_alive(ts.pid):
                            active_found = True
                            break
                        else:
                            # Process died, update status to FAILED
                            _write_status(
                                status_path,
                                TrainStatus(status="FAILED", pid=ts.pid),
                            )
                            logger.info(
                                f"Marked {d.name} as FAILED due to defunct PID {ts.pid}"
                            )

                if not active_found:
                    pending_dirs = []
                    for d in sorted([p for p in base.iterdir() if p.is_dir()]):
                        status_path = d / "train_status.json"
                        ts = _read_status(status_path)
                        if ts and ts.status == "PENDING":
                            pending_dirs.append(d)
                    if pending_dirs:
                        _launch_training(pending_dirs[0])
                        logger.info(f"Launched training for {pending_dirs[0].name}")

        except Exception:
            logger.exception("Error in train scheduler loop")
        finally:
            # Finally also executes when `continue` from a try block.
            if lock_file:
                try:
                    lock_file.release()  # Release the lock
                    logger.debug(f"Released lock.")
                except Exception as e:
                    logger.error(f"Error releasing lock file {lock_path}: {e}")
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
