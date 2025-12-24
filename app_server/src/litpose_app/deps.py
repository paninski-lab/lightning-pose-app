"""
Dependencies that can be injected into routes.
This has the benefit of making tests easier to write, as you can override dependencies.
See FastAPI Dependency Injection docs: https://fastapi.tiangolo.com/tutorial/dependencies/
"""

from __future__ import annotations

import logging
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


def project_info_getter(
    project_util: ProjectUtil = Depends(project_util),
) -> ProjectInfoGetter:
    def get_project_info(project_key: str) -> Project:
        project_paths = project_util.get_all_project_paths()
        try:
            project_path = project_paths[project_key]
        except KeyError:
            raise ProjectNotInProjectsToml(project_key)

        try:
            project_yaml_path = project_util.get_project_yaml_path(
                project_path.data_dir
            )
            # Load YAML data into a Python dictionary
            with open(project_yaml_path, "r") as f:
                yaml_data = yaml.safe_load(f)
        except FileNotFoundError:
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
