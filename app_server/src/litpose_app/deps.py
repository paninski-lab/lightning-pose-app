"""
Dependencies that can be injected into routes.
This has the benefit of making tests easier to write, as you can override dependencies.
See FastAPI Dependency Injection docs: https://fastapi.tiangolo.com/tutorial/dependencies/
"""

from __future__ import annotations

import logging
import math
import os
from typing import TYPE_CHECKING

from apscheduler.executors.debug import DebugExecutor
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.executors.pool import ThreadPoolExecutor
from fastapi import Depends

from litpose_app.config import Config

logger = logging.getLogger(__name__)


def config() -> Config:
    """Dependency that provides the app config object."""
    from .main import app

    if not hasattr(app.state, "config"):
        app.state.config = Config()
    return app.state.config


def scheduler() -> AsyncIOScheduler:
    """Dependency that provides the app's APScheduler instance."""
    from .main import app

    if not hasattr(app.state, "scheduler"):
        # ffmpeg parallelizes transcoding to the optimal degree, but
        # that doesn't always saturate a machine with a lot of cores.
        # i.e. on a 24 logical core machine (12 physical * 2 hyperthreads per core)
        # 3 was the ideal number of max_workers. Let's just guesstimate that
        # ffmpeg uses 10 cores? No scientific evidence, but ceil(24/10) => 3.
        transcode_workers = math.ceil(os.cpu_count() / 10)
        executors = {
            "transcode_pool": ThreadPoolExecutor(max_workers=transcode_workers),
            "debug": DebugExecutor(),
        }
        app.state.scheduler = AsyncIOScheduler(executors=executors)
    return app.state.scheduler


if TYPE_CHECKING:
    from .routes.project import ProjectInfo


def project_info(config: Config = Depends(config)) -> ProjectInfo:
    import tomli
    from .routes.project import ProjectInfo

    from pydantic import ValidationError

    try:
        # Open the file in binary read mode, as recommended by tomli
        with open(config.PROJECT_INFO_TOML_PATH, "rb") as f:
            # Load the TOML data into a Python dictionary
            toml_data = tomli.load(f)

        # Unpack the dictionary into the Pydantic model
        return ProjectInfo(**toml_data)
    except FileNotFoundError:
        return None
    except tomli.TOMLDecodeError as e:
        logger.error(f"Could not decode pyproject.toml. Invalid syntax: {e}")
        raise
    except ValidationError as e:
        logger.error(f"pyproject.toml is invalid. {e}")
        raise
