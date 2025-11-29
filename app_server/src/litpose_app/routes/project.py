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
    project_key: str
    data_dir: Path
    model_dir: Path | None = None


class ListProjectInfoResponse(BaseModel):
    projects: list[ListProjectItem]


class GetProjectInfoRequest(BaseModel):
    projectKey: str


class GetProjectInfoResponse(BaseModel):
    projectInfo: ProjectInfo | None  # None if project info not yet initialized


class AddExistingProjectRequest(BaseModel):
    projectKey: str
    data_dir: Path
    model_dir: Path | None = None


class UpdateProjectConfigRequest(BaseModel):
    projectKey: str

    # Exclude data_dir and model_dir from the request, they are not relevant.
    projectInfo: ProjectInfo


class CreateNewProjectRequest(BaseModel):
    projectKey: str
    data_dir: Path
    model_dir: Path | None = None


@router.post("/app/v0/rpc/listProjects")
def list_projects(
    project_util: ProjectUtil = Depends(deps.project_util),
) -> ListProjectInfoResponse:
    """Lists all projects known to the server (from projects.toml).

    Returns a list of project entries with their data and model directories.
    No request payload is required.
    """
    projects: list[ListProjectItem] = []
    try:
        all_paths = project_util.get_all_project_paths()
        for _key, paths in all_paths.items():
            # paths is a ProjectPaths instance
            projects.append(
                ListProjectItem(
                    project_key=_key,
                    data_dir=paths.data_dir,
                    model_dir=paths.model_dir,
                )
            )
    except Exception as e:
        logger.exception("Failed to list projects: %s", e)
        # Return empty list on failure; frontend can display an empty state
        return ListProjectInfoResponse(projects=[])

    return ListProjectInfoResponse(projects=projects)


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
        with open(project_util.get_project_yaml_path(project.paths.data_dir), "w") as f:
            yaml.dump({"schema_version": 1}, f)


@router.post("/app/v0/rpc/UpdateProjectsTomlEntry")
def add_existing_project(
    request: AddExistingProjectRequest,
    project_util: ProjectUtil = Depends(deps.project_util),
) -> None:
    pp_dict = {"data_dir": request.data_dir}
    if request.model_dir is not None:
        pp_dict["model_dir"] = request.model_dir
    pp = ProjectPaths.model_validate(pp_dict)
    project_util.update_project_paths(project_key=request.projectKey, projectpaths=pp)
    return None


@router.post("/app/v0/rpc/UpdateProjectConfig")
def update_project_config(
    request: UpdateProjectConfigRequest,
    project_util: ProjectUtil = Depends(deps.project_util),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> None:
    """
    Updates the project's project.yaml in the model directory (data_dir) using patch semantics.
    """
    existing_project = project_info_getter(request.projectKey)

    # Merge request settings with saved project settings
    project_yaml_dict = request.projectInfo.model_dump(
        mode="json", exclude_none=True, exclude={"data_dir", "model_dir"}
    )
    # Rename views to view_names
    if "views" in project_yaml_dict:
        project_yaml_dict["view_names"] = project_yaml_dict["views"]
        del project_yaml_dict["views"]

    # Save merged config
    with open(
        project_util.get_project_yaml_path(existing_project.paths.data_dir), "w"
    ) as f:
        yaml.dump(
            {
                # Dump without generating default values
                **existing_project.config.model_dump(exclude_unset=True),
                **project_yaml_dict,
            },
            f,
        )

    return None


@router.post("/app/v0/rpc/CreateNewProject")
def create_new_project(
    request: CreateNewProjectRequest,
    project_util: ProjectUtil = Depends(deps.project_util),
) -> None:
    """
    Creates a new project directory structure and initializes project.yaml with schema_version 1.
    Adds the project paths to projects.toml.
    """
    # Update projects.toml first
    pp_dict = {"data_dir": request.data_dir}
    if request.model_dir is not None:
        pp_dict["model_dir"] = request.model_dir
    pp = ProjectPaths.model_validate(pp_dict)

    try:
        # Create directories and minimal yaml
        data_dir = pp.data_dir
        model_dir = pp.model_dir
        data_dir.mkdir(parents=True)
        model_dir.mkdir(parents=True)

        project_yaml_path = project_util.get_project_yaml_path(data_dir)

        with open(project_yaml_path, "x") as f:
            yaml.dump({"schema_version": 1}, f)
    except FileExistsError as e:
        raise ApplicationError(
            f"File in project {request.projectKey} already exists: {e.filename}"
        )
    project_util.update_project_paths(project_key=request.projectKey, projectpaths=pp)

    return None
