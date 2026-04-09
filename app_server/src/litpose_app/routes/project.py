import logging
import os
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import yaml
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ValidationError

from litpose_app.datatypes import ProjectPaths
from litpose_app.project import ProjectUtil
from litpose_app import deps
from litpose_app.deps import (
    ProjectInfoGetter,
    ApplicationError,
)
from litpose_app.routes.rglob import _rglob
from litpose_app.routes.labeler.find_label_files import _check_label_file_headers
from litpose_app.routes.models import read_models_l1_from_base
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row
from litpose_app.migrations import run_migrations_for_project

logger = logging.getLogger(__name__)

router = APIRouter()


class ProjectInfo(BaseModel):
    """Class to hold information about the project"""

    data_dir: Path | None = None
    model_dir: Path | None = None
    views: list[str] | None = None
    keypoint_names: list[str] | None = None


class LabelFileStats(BaseModel):
    name: str
    total_frames: int
    labeled_frames: int


class ProjectStats(BaseModel):
    session_count: int
    label_file_count: int
    label_files_stats: list[LabelFileStats]
    labeled_frames_count: int | None = None
    keypoint_names: list[str]
    view_names: list[str]
    model_count: int
    error: str | None = None


class ListProjectItem(BaseModel):
    project_key: str
    data_dir: Path
    model_dir: Path | None = None
    stats: ProjectStats | None = None


class ListProjectInfoResponse(BaseModel):
    projects: list[ListProjectItem]


class GetProjectInfoRequest(BaseModel):
    projectKey: str


class GetProjectInfoResponse(BaseModel):
    projectInfo: ProjectInfo | None  # None if project info not yet initialized


class UpdateProjectPathsRequest(BaseModel):
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


class RegisterExistingProjectRequest(BaseModel):
    projectKey: str
    data_dir: Path
    model_dir: Path | None = None


class DeleteProjectRequest(BaseModel):
    projectKey: str
    removeFiles: bool = False


def _get_label_file_stats(csv_path: Path) -> LabelFileStats | None:
    try:
        # We need the full data to count labeled vs unlabeled
        df = pd.read_csv(csv_path, header=[0, 1, 2])
        df = fix_empty_first_row(df)
        labeled_frames = len(df)

        # Count frames in the unlabeled sidecar
        unlabeled_sidecar = csv_path.with_suffix(".unlabeled.jsonl")
        unlabeled_frames = 0
        if unlabeled_sidecar.exists():
            try:
                with open(unlabeled_sidecar, "r") as f:
                    # Count non-empty lines
                    unlabeled_frames = sum(1 for line in f if line.strip())
            except Exception as e:
                logger.warning(f"Error reading sidecar {unlabeled_sidecar}: {e}")

        return LabelFileStats(
            name=csv_path.name,
            total_frames=labeled_frames + unlabeled_frames,
            labeled_frames=labeled_frames,
        )
    except Exception as e:
        logger.warning(f"Error getting stats for {csv_path}: {e}")
        return None


def _fetch_all_stats(project_key, project_util, project_info_getter) -> ProjectStats:
    try:
        project = project_info_getter(project_key)
    except ApplicationError as e:
        return ProjectStats(
            session_count=0,
            label_file_count=0,
            label_files_stats=[],
            keypoint_names=[],
            view_names=[],
            model_count=0,
            error=str(e),
        )
    except Exception as e:
        return ProjectStats(
            session_count=0,
            label_file_count=0,
            label_files_stats=[],
            keypoint_names=[],
            view_names=[],
            model_count=0,
            error=f"Unexpected error loading project: {e}",
        )

    data_dir = project.paths.data_dir
    model_dir = project.paths.model_dir
    views = project.config.view_names
    keypoints = project.config.keypoint_names

    try:
        # 1. Sessions
        mp4_entries = _rglob(str(data_dir), pattern="videos*/**/*.mp4", no_dirs=True)
        mp4_paths = [str(e["path"]) for e in mp4_entries]
        # Simple grouping logic: replace view name with *
        session_keys = set()
        for p in mp4_paths:
            filename = Path(p).name
            view_found = False
            for v in views:
                if v in filename:
                    session_keys.add(filename.replace(v, "*"))
                    view_found = True
                    break
            if not view_found:
                session_keys.add(filename)

        # 2. Label files
        csv_entries = _rglob(str(data_dir), pattern="*.csv", no_dirs=True)
        candidate_csv_paths = [Path(e["path"]) for e in csv_entries]
        # Filter out models
        if model_dir and model_dir.is_relative_to(data_dir):
            candidate_csv_paths = [
                p
                for p in candidate_csv_paths
                if not (data_dir / p).is_relative_to(model_dir)
            ]

        valid_label_files = []
        for p in candidate_csv_paths:
            if _check_label_file_headers(p, data_dir):
                valid_label_files.append(data_dir / p)

        label_files_stats_raw = []
        with ThreadPoolExecutor() as executor:
            futures = [
                executor.submit(_get_label_file_stats, p) for p in valid_label_files
            ]
            for f in as_completed(futures):
                res = f.result()
                if res:
                    label_files_stats_raw.append(res)

        # Group label files by name (stripping view names)
        grouped_stats: dict[str, LabelFileStats] = {}
        for s in label_files_stats_raw:
            name = s.name
            for v in views:
                if v in name:
                    name = name.replace(v, "*")
                    break
            if name not in grouped_stats:
                grouped_stats[name] = LabelFileStats(
                    name=name,
                    total_frames=s.total_frames,
                    labeled_frames=s.labeled_frames,
                )
            else:
                # If they are different, we might want to warn or just take the max/min.
                # Usually they should be the same.
                existing = grouped_stats[name]
                grouped_stats[name] = LabelFileStats(
                    name=name,
                    total_frames=max(existing.total_frames, s.total_frames),
                    labeled_frames=max(existing.labeled_frames, s.labeled_frames),
                )

        # Find main label file stats (CollectedData_*.csv or CollectedData.csv)
        main_label_frames = None
        # Try exact matches first
        for target in ["CollectedData_*.csv", "CollectedData.csv"]:
            if target in grouped_stats:
                main_label_frames = grouped_stats[target].labeled_frames
                break

        # 3. Models
        model_count = 0
        if model_dir and model_dir.exists():
            models = read_models_l1_from_base(model_dir, model_dir)
            # Filter only those with config (actual models)
            model_count = len([m for m in models if m.config is not None])

        return ProjectStats(
            session_count=len(session_keys),
            label_file_count=len(grouped_stats),
            label_files_stats=list(grouped_stats.values()),
            labeled_frames_count=main_label_frames,
            keypoint_names=keypoints,
            view_names=views,
            model_count=model_count,
        )
    except Exception as e:
        logger.exception("Error fetching stats for project %s", project_key)
        return ProjectStats(
            session_count=0,
            label_file_count=0,
            label_files_stats=[],
            keypoint_names=keypoints,
            view_names=views,
            model_count=0,
            error=f"Error fetching stats: {e}",
        )


@router.post("/app/v0/rpc/listProjects")
def list_projects(
    project_util: ProjectUtil = Depends(deps.project_util),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ListProjectInfoResponse:
    """Lists all projects known to the server (from projects.toml).

    Returns a list of project entries with their data and model directories.
    No request payload is required.
    """
    projects_list: list[ListProjectItem] = []
    try:
        all_paths = project_util.get_all_project_paths()

        # Fetch stats in parallel for all projects
        with ThreadPoolExecutor() as executor:
            future_to_key = {
                executor.submit(
                    _fetch_all_stats, key, project_util, project_info_getter
                ): key
                for key in all_paths.keys()
            }

            for future in as_completed(future_to_key):
                key = future_to_key[future]
                paths = all_paths[key]
                try:
                    stats = future.result()
                    projects_list.append(
                        ListProjectItem(
                            project_key=key,
                            data_dir=paths.data_dir,
                            model_dir=paths.model_dir,
                            stats=stats,
                        )
                    )
                except Exception as e:
                    logger.exception("Failed to fetch stats for project %s: %s", key, e)
                    projects_list.append(
                        ListProjectItem(
                            project_key=key,
                            data_dir=paths.data_dir,
                            model_dir=paths.model_dir,
                            stats=None,
                        )
                    )
    except Exception as e:
        logger.exception("Failed to list projects: %s", e)
        return ListProjectInfoResponse(projects=[])

    # Sort projects by key for stable UI
    projects_list.sort(key=lambda x: x.project_key)
    return ListProjectInfoResponse(projects=projects_list)


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


@router.post("/app/v0/rpc/UpdateProjectPaths")
def update_project_paths_rpc(
    request: UpdateProjectPathsRequest,
    project_util: ProjectUtil = Depends(deps.project_util),
) -> None:
    pp_dict = {"data_dir": request.data_dir}
    if request.model_dir is not None:
        pp_dict["model_dir"] = request.model_dir
    pp = ProjectPaths.model_validate(pp_dict)
    run_migrations_for_project(pp)
    project_util.update_project_paths(project_key=request.projectKey, projectpaths=pp)
    return None


@router.post("/app/v0/rpc/RegisterExistingProject")
def register_existing_project(
    request: RegisterExistingProjectRequest,
    project_util: ProjectUtil = Depends(deps.project_util),
) -> None:
    """
    Registers an existing project directory into projects.toml.
    """
    pp_dict = {"data_dir": request.data_dir}
    if request.model_dir is not None:
        pp_dict["model_dir"] = request.model_dir
    pp = ProjectPaths.model_validate(pp_dict)
    run_migrations_for_project(pp)
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

    # 1. Validate: If changing both paths and metadata, ensure target project.yaml exists
    # to avoid partial failure (updating projects.toml but failing to update project.yaml).
    requested_data_dir = request.projectInfo.data_dir
    requested_model_dir = request.projectInfo.model_dir
    path_changed = (
        requested_data_dir is not None
        and requested_data_dir != existing_project.paths.data_dir
    ) or (
        requested_model_dir is not None
        and requested_model_dir != existing_project.paths.model_dir
    )

    metadata_to_update = request.projectInfo.model_dump(
        mode="json", exclude_none=True, exclude={"data_dir", "model_dir"}
    )
    metadata_changed = len(metadata_to_update) > 0

    if path_changed and metadata_changed:
        target_data_dir = requested_data_dir or existing_project.paths.data_dir
        project_yaml_path = project_util.get_project_yaml_path(target_data_dir)
        if not project_yaml_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project configuration file not found at {project_yaml_path}. "
                "Cannot update metadata while changing project paths if the target "
                "config file does not exist.",
            )

    # 2. Update project paths if changed and get the target data/model dirs
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


@router.post("/app/v0/rpc/deleteProject")
def delete_project(
    request: DeleteProjectRequest,
    project_util: ProjectUtil = Depends(deps.project_util),
) -> None:
    # 1. Get project paths before unregistering if we need to remove files
    if request.removeFiles:
        paths = project_util.get_all_project_paths().get(request.projectKey)
        if paths:
            # We use shutil.rmtree for physical deletion.
            if paths.data_dir and os.path.exists(paths.data_dir):
                shutil.rmtree(paths.data_dir)
            if paths.model_dir and os.path.exists(paths.model_dir):
                shutil.rmtree(paths.model_dir)

    # 2. Unregister project from projects.toml
    try:
        project_util.update_project_paths(request.projectKey, None)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{request.projectKey}' not found.",
        )
