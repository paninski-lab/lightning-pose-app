"""Labeler route package: frame labeling, bundle adjustment, autolabeling, and calibration."""

from __future__ import annotations

from pathlib import Path

from ...config import Config
from ...datatypes import Project


def get_session_level_calibration_path(
    session_key: str, project: Project, config: Config
) -> Path:
    """Return the expected path for the session-level calibration TOML file."""
    return project.paths.data_dir / config.CALIBRATIONS_DIRNAME / f"{session_key}.toml"


def find_calibration_file(
    session_key: str, project: Project, config: Config
) -> None | Path:
    """Return the session-level calibration path if it exists, falling back to the global one."""
    session_level_path = get_session_level_calibration_path(session_key, project, config)
    if session_level_path.is_file():
        return session_level_path

    global_calibrations_path = project.paths.data_dir / config.GLOBAL_CALIBRATION_PATH
    if global_calibrations_path.is_file():
        return global_calibrations_path

    return None


from fastapi import APIRouter

from . import bundle_adjust as _bundle_adjust
from . import find_label_files as _find_label_files
from . import multiview_autolabel as _multiview_autolabel
from . import save_mvframe as _save_mvframe

# Sub-route modules within the labeler package

# Aggregate router for labeler endpoints
router = APIRouter()

# Mount sub-routers
router.include_router(_save_mvframe.router)
router.include_router(_multiview_autolabel.router)
router.include_router(_find_label_files.router)
router.include_router(_bundle_adjust.router)
