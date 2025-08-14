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
        config_path = deps.config().PROJECT_INFO_TOML_PATH.resolve()
        if event.src_path == str(config_path):
            logger.info(
                f"Config file modified: {event.src_path}. Enqueuing new fine videos."
            )
            asyncio.run_coroutine_threadsafe(
                enqueue_all_new_fine_videos_task(), self.loop
            )


def setup_config_watcher() -> Observer:
    config_instance = deps.config()
    config_file_path = config_instance.PROJECT_INFO_TOML_PATH.resolve()
    config_dir = config_file_path.parent

    observer = Observer()
    event_handler = ConfigFileChangeHandler(asyncio.get_event_loop())
    observer.schedule(event_handler, path=str(config_dir), recursive=False)
    observer.start()
    logger.info(f"Watching for changes in {config_file_path}")
    return observer
