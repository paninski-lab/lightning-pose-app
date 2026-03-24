"""
Dependencies that can be injected into routes.
This has the benefit of making tests easier to write, as you can override dependencies.
See FastAPI Dependency Injection docs: https://fastapi.tiangolo.com/tutorial/dependencies/
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Callable

import yaml
from fastapi import Depends
from litpose_app.datatypes import ProjectConfig, Project
from litpose_app.rootconfig import RootConfig
from litpose_app.project import ProjectUtil

from litpose_app.config import Config

logger = logging.getLogger(__name__)


def config() -> Config:
    """Dependency that provides the app config object."""
    from .main import app

    if not hasattr(app.state, "config"):
        app.state.config = Config()
    return app.state.config


ProjectInfoGetter = Callable[[str], Project]


def root_config() -> RootConfig:
    return RootConfig()


def project_util(root_config: RootConfig = Depends(root_config)) -> ProjectUtil:
    return ProjectUtil(root_config)


class ApplicationError(Exception):
    user_facing_message: str

    def __init__(self, message: str):
        super().__init__(message)
        self.user_facing_message = message


class ProjectNotInProjectsToml(ApplicationError):
    def __init__(self, project_key: str):
        super().__init__(f"Project {project_key} not found in projects.toml file")


def _ensure_project_yaml(
    project_yaml_path: Path, config: Config
) -> dict | None:
    """
    Tries to create project.yaml from other YAML files in the repo.
    Returns the created yaml_data or None if no suitable template was found.
    """
    # Try to create project.yaml from other YAML files in the repo
    # We use /home/ksikka/work/lp as repo root by default
    repo_root = Path(getattr(config, "REPO_ROOT", "/home/ksikka/work/lp"))
    # In some test environments, we might want to override REPO_ROOT via env var
    if "REPO_ROOT" in os.environ:
        repo_root = Path(os.environ["REPO_ROOT"])
    yaml_files = repo_root.rglob("*.yaml")
    yaml_data = None
    for yf in yaml_files:
        if "node_modules" in str(yf):
            continue
        try:
            with open(yf, "r") as f:
                candidate_data = yaml.safe_load(f)
            if candidate_data and "data" in candidate_data:
                data_part = candidate_data["data"]
                if (
                    isinstance(data_part, dict)
                    and "view_names" in data_part
                    and "keypoint_names" in data_part
                    and data_part["view_names"] is not None
                    and data_part["keypoint_names"] is not None
                ):
                    # Found a suitable template
                    yaml_data = {
                        "view_names": data_part["view_names"],
                        "keypoint_names": data_part["keypoint_names"],
                    }
                    # Create the project.yaml file
                    with open(project_yaml_path, "w") as f:
                        yaml.dump(yaml_data, f)
                    logger.info(
                        f"Created {project_yaml_path} using template from {yf}"
                    )
                    break
        except Exception:
            continue
    return yaml_data


def project_info_getter(
    project_util: ProjectUtil = Depends(project_util),
    config: Config = Depends(config),
) -> ProjectInfoGetter:
    def get_project_info(project_key: str) -> Project:
        project_paths = project_util.get_all_project_paths()
        try:
            project_path = project_paths[project_key]
        except KeyError:
            raise ProjectNotInProjectsToml(project_key)

        try:
            data_dir = Path(project_path.data_dir)
            if not data_dir.exists():
                raise ApplicationError(
                    f"Data directory {data_dir} does not exist."
                )
            if not data_dir.is_dir():
                raise ApplicationError(
                    f"Data directory {data_dir} is not a directory."
                )

            project_yaml_path = project_util.get_project_yaml_path(
                project_path.data_dir
            )
            # Load YAML data into a Python dictionary
            with open(project_yaml_path, "r") as f:
                yaml_data = yaml.safe_load(f)
        except PermissionError:
            raise ApplicationError(
                f"Permission denied when accessing project files in {project_path.data_dir}."
            )
        except FileNotFoundError:
            project_yaml_path = project_util.get_project_yaml_path(
                project_path.data_dir
            )
            yaml_data = _ensure_project_yaml(project_yaml_path, config)
            if yaml_data is None:
                raise ApplicationError(
                    f"Could not find a project.yaml file in data directory."
                )
        except yaml.YAMLError as e:
            raise ApplicationError(
                f"Could not decode project.yaml file in data directory. Invalid syntax: {e}"
            )

        return Project.model_validate(
            {
                "project_key": project_key,
                "paths": project_path,
                "config": ProjectConfig.model_validate(yaml_data),
            }
        )

    return get_project_info
