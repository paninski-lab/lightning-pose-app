import logging
import shutil
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ValidationError

from litpose_app.datatypes import ProjectPaths
from litpose_app.project import ProjectUtil
from litpose_app import deps
from litpose_app.deps import (
    ProjectInfoGetter,
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
    # Additional configuration to write into project.yaml (now required)
    projectInfo: ProjectInfo


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

    # Update project paths if changed and get the target data/model dirs
    target_data_dir, target_model_dir = _update_paths_if_changed(
        project_key=request.projectKey,
        existing_paths=existing_project.paths,
        requested_data_dir=request.projectInfo.data_dir,
        requested_model_dir=request.projectInfo.model_dir,
        project_util=project_util,
    )

    # Merge request settings with saved project settings (excluding path fields)
    project_yaml_dict = request.projectInfo.model_dump(
        mode="json", exclude_none=True, exclude={"data_dir", "model_dir"}
    )
    # Rename views to view_names
    if "views" in project_yaml_dict:
        project_yaml_dict["view_names"] = project_yaml_dict["views"]
        del project_yaml_dict["views"]

    # Save merged config to the target data_dir (which may have changed)
    project_yaml_path = project_util.get_project_yaml_path(target_data_dir)
    new_yaml_dict = {
        # Dump without generating default values
        **existing_project.config.model_dump(exclude_unset=True),
        **project_yaml_dict,
    }

    # Load existing YAML (if present) to compare contents
    existing_yaml_dict: dict | None = None
    try:
        if project_yaml_path.exists():
            with open(project_yaml_path, "r") as f:
                existing_yaml_dict = yaml.safe_load(f) or {}
    except Exception as e:
        # If we cannot read/parse, force a rewrite to ensure correctness
        logger.warning(
            "Failed to read existing project.yaml at %s: %s; will rewrite.",
            project_yaml_path,
            e,
        )
        existing_yaml_dict = None

    if existing_yaml_dict != new_yaml_dict:
        with open(project_yaml_path, "w") as f:
            yaml.safe_dump(new_yaml_dict, f)
        logger.info("project.yaml updated at %s", project_yaml_path)
    else:
        logger.info("project.yaml unchanged; skipping write at %s", project_yaml_path)

    return None


def _update_paths_if_changed(
    *,
    project_key: str,
    existing_paths: ProjectPaths,
    requested_data_dir: Path | None,
    requested_model_dir: Path | None,
    project_util: ProjectUtil,
) -> tuple[Path, Path | None]:
    """Update projects.toml if paths changed and return target paths.

    - Starts from the existing paths.
    - If the request provides new values that differ, updates projects.toml via
      ProjectUtil and returns the updated targets.
    """

    target_data_dir: Path = existing_paths.data_dir
    target_model_dir: Path | None = existing_paths.model_dir

    changed_paths = False

    if requested_data_dir is not None and requested_data_dir != target_data_dir:
        target_data_dir = requested_data_dir
        changed_paths = True

    if requested_model_dir is not None and requested_model_dir != target_model_dir:
        target_model_dir = requested_model_dir
        changed_paths = True

    if changed_paths:
        pp_dict: dict[str, Path] = {"data_dir": target_data_dir}
        # Only persist model_dir if it was explicitly requested in the payload.
        # This mirrors prior behavior of omitting model_dir unless provided.
        if requested_model_dir is not None:
            pp_dict["model_dir"] = target_model_dir
        pp = ProjectPaths.model_validate(pp_dict)
        project_util.update_project_paths(project_key=project_key, projectpaths=pp)

    return target_data_dir, target_model_dir


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

    data_dir = pp.data_dir
    model_dir = pp.model_dir

    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "configs").mkdir(exist_ok=True)
    CONFIG_FILES = ("config_default.yaml", "config_default_multiview.yaml")
    # Copy the config file stored in the same directory as the litpose_app package to the configs directory
    # Get the directory where litpose_app package is installed
    package_dir = Path(__file__).parent.parent

    # Copy each config file to the project's configs directory
    for config_file in CONFIG_FILES:
        src = package_dir / config_file
        if src.exists():
            dst = data_dir / "configs" / config_file
            shutil.copy2(src, dst)
    project_yaml_path = project_util.get_project_yaml_path(data_dir)

    # Build initial YAML contents
    new_yaml: dict = {"schema_version": 1}

    # Merge required projectInfo fields
    info_dict = request.projectInfo.model_dump(
        mode="json", exclude_none=True, exclude={"data_dir", "model_dir"}
    )
    if "views" in info_dict:
        info_dict["view_names"] = info_dict["views"]
        del info_dict["views"]
    new_yaml.update(info_dict)

    with open(project_yaml_path, "x") as f:
        yaml.safe_dump(new_yaml, f)

    model_dir.mkdir(parents=True, exist_ok=True)

    project_util.update_project_paths(project_key=request.projectKey, projectpaths=pp)

    return None
