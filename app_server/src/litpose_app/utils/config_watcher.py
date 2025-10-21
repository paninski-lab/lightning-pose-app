import asyncio
import logging

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from .enqueue import enqueue_all_new_fine_videos_task
from .. import deps

logger = logging.getLogger(__name__)


class ConfigFileChangeHandler(FileSystemEventHandler):
    def __init__(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop
        super().__init__()

    def on_modified(self, event):
        project_toml_path = deps.config().PROJECT_INFO_TOML_PATH.resolve()
        if event.src_path == str(project_toml_path):
            logger.info(
                f"Config file modified: {event.src_path}. Enqueuing new fine videos."
            )
            asyncio.run_coroutine_threadsafe(
                enqueue_all_new_fine_videos_task(), self.loop
            )


def setup_config_watcher() -> Observer:
    config_instance = deps.config()
    project_toml_path = config_instance.PROJECT_INFO_TOML_PATH.resolve()
    if not project_toml_path.exists():
        project_toml_path.parent.mkdir(parents=True, exist_ok=True)
        project_toml_path.touch()
    lp_private_dir = project_toml_path.parent

    observer = Observer()
    event_handler = ConfigFileChangeHandler(asyncio.get_event_loop())
    observer.schedule(event_handler, path=str(lp_private_dir), recursive=False)
    observer.start()
    logger.info(f"Watching for changes in {project_toml_path}")
    return observer
