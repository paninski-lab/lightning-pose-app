from __future__ import annotations

from lightning_pose.project import get_project_config, get_all_projects, set_project_config

from litpose_app.config import Config
from .models import LegacyGetProjectInfoResponse, LegacyProjectInfo, LegacySetProjectInfoRequest


def get_project_info(config: Config) -> LegacyGetProjectInfoResponse:
    """Return info for the active project derived from Config.

    Raises:
        FileNotFoundError: If no projects directory exists or none are found.
    """
    try:
        all_projects = get_all_projects()
    except FileNotFoundError:
        # Surface this so Flask layer can map to 404
        raise

    try:
        with open(config.ACTIVE_PROJECT_FILE_PATH, "r") as f:
            active_project_key = f.read().strip()
    except FileNotFoundError:
        active_project_key = None

    # If the active project is invalid, reset it to the first project
    if active_project_key not in (p.project_key for p in all_projects):
        active_project_key = all_projects[0].project_key
        with open(config.ACTIVE_PROJECT_FILE_PATH, "w") as f:
            f.write(active_project_key)

    project = get_project_config(active_project_key)
    return LegacyGetProjectInfoResponse(
        projectInfo=LegacyProjectInfo(
            project_key=project.project_key,
            data_dir=project.dirs.data_dir,
            model_dir=project.dirs.model_dir,
            views=project.view_names,
            keypoint_names=project.keypoint_names,
        )
    )


def set_project_info(config: Config, request: LegacySetProjectInfoRequest) -> None:
    with open(config.ACTIVE_PROJECT_FILE_PATH, "r") as f:
        active_project_key = f.read().strip()

    set_project_config(active_project_key, request.projectInfo)

