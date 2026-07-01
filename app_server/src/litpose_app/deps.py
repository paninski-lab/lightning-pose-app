"""
Dependencies that can be injected into routes.
This has the benefit of making tests easier to write, as you can override dependencies.
See FastAPI Dependency Injection docs: https://fastapi.tiangolo.com/tutorial/dependencies/
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

import yaml
from fastapi import Depends

from litpose_app.config import Config
from litpose_app.datatypes import Project, ProjectConfig
from litpose_app.project import ProjectUtil
from litpose_app.rootconfig import RootConfig

logger = logging.getLogger(__name__)


def config() -> Config:
    """Dependency that provides the app config object."""
    from .main import app

    if not hasattr(app.state, "config"):
        app.state.config = Config()
    return app.state.config


ProjectInfoGetter = Callable[[str], Project]


def root_config() -> RootConfig:
    """Dependency that provides the system-level root configuration."""
    return RootConfig()


def project_util(root_config: RootConfig = Depends(root_config)) -> ProjectUtil:
    """Dependency that provides a ProjectUtil bound to the current root config."""
    return ProjectUtil(root_config)


class ApplicationError(Exception):
    """User-facing error surfaced to the frontend as a modal dialog."""

    user_facing_message: str

    def __init__(self, message: str) -> None:
        """Initialize with a message shown directly to the user."""
        super().__init__(message)
        self.user_facing_message = message


class ProjectNotInProjectsToml(ApplicationError):
    """Raised when a project key is not found in projects.toml."""

    def __init__(self, project_key: str) -> None:
        """Initialize for the given missing project key."""
        super().__init__(f"Project {project_key} not found in projects.toml file")




def project_info_getter(
    project_util: ProjectUtil = Depends(project_util),
    config: Config = Depends(config),
) -> ProjectInfoGetter:
    """Dependency that returns a callable for loading a Project by key."""
    def get_project_info(project_key: str) -> Project:
        """Load and validate a project by key, raising ApplicationError on failure."""
        project_paths = project_util.get_all_project_paths()
        try:
            project_path = project_paths[project_key]
        except KeyError:
            raise ProjectNotInProjectsToml(project_key)

        try:
            data_dir = Path(project_path.data_dir)
            if not data_dir.exists():
                raise ApplicationError(f"Data directory {data_dir} does not exist.")
            if not data_dir.is_dir():
                raise ApplicationError(f"Data directory {data_dir} is not a directory.")

            project_yaml_path = project_util.get_project_yaml_path(
                project_path.data_dir
            )
            # Load YAML data into a Python dictionary
            with open(project_yaml_path) as f:
                yaml_data = yaml.safe_load(f)
        except PermissionError:
            raise ApplicationError(
                f"Permission denied when accessing project files in {project_path.data_dir}."
            )
        except FileNotFoundError:
            raise ApplicationError(
                "Could not find a project.yaml file in data directory."
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
