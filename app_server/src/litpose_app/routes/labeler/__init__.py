from pathlib import Path

from ..project import ProjectInfo
from ...config import Config

def session_level_config_path(
    session_key: str, project_info: ProjectInfo, config: Config
) -> Path:
    return project_info.data_dir / config.CALIBRATIONS_DIRNAME / f"{session_key}.toml"



def find_calibration_file(
    session_key: str, project_info: ProjectInfo, config: Config
) -> None | Path:
    session_level_path = session_level_config_path(session_key, project_info, config)
    if session_level_path.is_file():
        return session_level_path

    global_calibrations_path = project_info.data_dir / config.GLOBAL_CALIBRATION_PATH
    if global_calibrations_path.is_file():
        return global_calibrations_path

    return None
from fastapi import APIRouter

from . import multiview_autolabel as _multiview_autolabel
from . import save_mvframe as _save_mvframe
from . import write_multifile as _write_multifile
from . import find_label_files as _find_label_files
from . import bundle_adjust as _bundle_adjust

# Sub-route modules within the labeler package

# Aggregate router for labeler endpoints
router = APIRouter()

# Mount sub-routers
router.include_router(_write_multifile.router)
router.include_router(_save_mvframe.router)
router.include_router(_multiview_autolabel.router)
router.include_router(_find_label_files.router)
router.include_router(_bundle_adjust.router)
