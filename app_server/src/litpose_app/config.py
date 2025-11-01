"""Routes should not access this directly, if they want to be able to
modify these in unit tests.
Instead, prefer to inject `config: deps.config into the route using FastAPI's dependency injection.
See https://fastapi.tiangolo.com/tutorial/dependencies/."""

import os

from pydantic import BaseModel
from pathlib import Path


class Config(BaseModel):
    LP_DIR: Path = Path.home() / ".lightning_pose"
    ACTIVE_PROJECT_FILE_PATH: Path = LP_DIR / "active_project.txt"

    CADDY_BIN_PATH: Path = LP_DIR / "bin" / "caddy_linux_amd64_v2_10_2" #TODO support Mac, windows.

    ###
    # Frame extraction config
    ###

    FRAME_EXTRACT_N_CONTEXT_FRAMES: int = 2
    FMT_FRAME_INDEX_DIGITS: int = 8
    N_WORKERS: int = os.cpu_count()
    FRAME_EXTRACT_RESIZE_DIMS: int = 64

