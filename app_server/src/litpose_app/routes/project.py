import logging
from pathlib import Path

import tomli
import tomli_w
import yaml
from fastapi import APIRouter, Depends, BackgroundTasks
from lightning_pose.data.datatypes import ProjectPaths, Project
from lightning_pose.utils.project import ProjectUtil
from pydantic import BaseModel, ValidationError

from litpose_app import deps
from litpose_app.config import Config
from litpose_app.deps import (
    ProjectInfoGetter,
    ProjectNotInProjectsToml,
    ApplicationError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class ProjectInfo(BaseModel):
    """Class to hold information about the project"""

    data_dir: Path | None = None
    model_dir: Path | None = None
    views: list[str] | None = None
    keypoint_names: list[str] | None = None


class ListProjectItem(BaseModel):
    data_dir: Path
    model_dir: Path


class ListProjectInfoResponse(BaseModel):
    projects: list[ListProjectItem]


class GetProjectInfoRequest(BaseModel):
    projectKey: str


class GetProjectInfoResponse(BaseModel):
    projectInfo: ProjectInfo | None  # None if project info not yet initialized


class SetProjectInfoRequest(BaseModel):
    projectKey: str
    projectInfo: ProjectInfo


# list project
# update project


@router.post("/app/v0/rpc/getProjectInfo")
def get_project_info(
    request: GetProjectInfoRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> GetProjectInfoResponse:
    project = project_info_getter(request.projectKey)

    try:

        # Merge data from ProjectConfig and ProjectPath
        merged = {
            **project.config.model_dump(),
            **project.paths.model_dump(),
            "views": project.config.model_dump()[
                "view_names"
            ],  # Rename view_names to views
        }
        del merged["view_names"]

        project_info = ProjectInfo.model_validate(merged)

    except ValidationError as e:
        raise ApplicationError(f"project.yaml was invalid. {e}")

    return GetProjectInfoResponse(projectInfo=project_info)


def _create_project_dir_if_needed(project: Project, project_util: ProjectUtil):
    project.paths.data_dir.mkdir(parents=True, exist_ok=True)
    project.paths.model_dir.mkdir(exist_ok=True)
    if not project_util.get_project_yaml_path(project.paths.data_dir).is_file():
        project_util.get_project_yaml_path(project.paths.data_dir).touch()


@router.post("/app/v0/rpc/setProjectInfo")
def set_project_info(
    request: SetProjectInfoRequest,
    project_util: ProjectUtil = Depends(deps.project_util),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
    config: Config = Depends(deps.config),
) -> None:
    """
    Creates or updates projects.toml entry if needed.
    Updates project.yaml by merging request data with existing data.
    """
    try:
        existing_project = project_info_getter(request.projectKey)
    except ProjectNotInProjectsToml:
        data_dir, model_dir = (
            request.projectInfo.data_dir,
            request.projectInfo.model_dir,
        )
        pp = ProjectPaths.model_validate(data_dir=data_dir, model_dir=model_dir)
        project_util.update_project_paths(
            project_key=request.projectKey, projectpaths=pp
        )

        # Try again
        existing_project = project_info_getter(request.projectKey)

    # Create project dir if needed
    _create_project_dir_if_needed(existing_project, project_util)

    # Merge request settings with saved project settings
    project_yaml_dict = request.projectInfo.model_dump(
        mode="json", exclude_none=True, exclude={"data_dir", "model_dir"}
    )
    # Rename views to view_names
    project_yaml_dict["view_names"] = project_yaml_dict["views"]
    del project_yaml_dict["views"]

    # Save merged config
    with open(
        project_util.get_project_yaml_path(existing_project.paths.data_dir), "w"
    ) as f:
        yaml.dump(
            {
                **existing_project.config.model_dump(),
                **project_yaml_dict,
            },
            f,
        )

    return None
