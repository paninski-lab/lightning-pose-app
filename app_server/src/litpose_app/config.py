"""Routes should not access this directly, if they want to be able to
modify these in unit tests.
Instead, prefer to inject `config: deps.config into the route using FastAPI's dependency injection.
See https://fastapi.tiangolo.com/tutorial/dependencies/."""

import os
from typing import Literal

from pydantic import BaseModel


# Consider `pydantic_settings.BaseSettings` for potential future needs.
class Config(BaseModel):
    """In-process application constants for frame extraction and video handling."""

    ## Video transcoding settings

    # Name of the directory in data_dir where extract frames will output to
    LABELED_DATA_DIRNAME: str = "labeled-data"

    # Calibration file locations are defined in calibration_paths.py.

    ###
    # Frame extraction config
    ###

    FRAME_EXTRACT_N_CONTEXT_FRAMES: int = 2
    FMT_FRAME_INDEX_DIGITS: int = 8
    N_WORKERS: int = os.cpu_count()
    FRAME_EXTRACT_RESIZE_DIMS: int = 64

    # "root": data_dir/*.csv. "tree": data_dir/**/*.csv.
    # The File Manager label panel glob must match (*.csv or **/*.csv).
    LABEL_CSV_SCOPE: Literal["root", "tree"] = "root"
