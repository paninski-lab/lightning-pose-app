"""Routes should not access this directly, if they want to be able to
modify these in unit tests.
Instead, prefer to inject `config: deps.config into the route using FastAPI's dependency injection.
See https://fastapi.tiangolo.com/tutorial/dependencies/."""

import os
from pathlib import Path

from pydantic import BaseModel


# Consider `pydantic_settings.BaseSettings` for potential future needs.
class Config(BaseModel):
    PROJECT_INFO_TOML_PATH: Path = Path("~/.lightning_pose/project.toml").expanduser()

    ## Video transcoding settings

    # Directory where finely transcoded videos are stored
    FINE_VIDEO_DIR: Path = Path("~/.lightning_pose/finevideos").expanduser()

    # Name of the directory in data_dir where extract frames will output to
    LABELED_DATA_DIRNAME: str = "labeled_data"

    # Name of the directory in data_dir containing session-specific calibration files
    CALIBRATIONS_DIRNAME: str = "calibrations"
    CALIBRATION_BACKUPS_DIRNAME: str = "calibration_backups"

    GLOBAL_CALIBRATION_PATH: str = "calibration.toml"

    ###
    # Frame extraction config
    ###

    FRAME_EXTRACT_N_CONTEXT_FRAMES: int = 2
    FMT_FRAME_INDEX_DIGITS: int = 8
    N_WORKERS: int = os.cpu_count()
    FRAME_EXTRACT_RESIZE_DIMS: int = 64
