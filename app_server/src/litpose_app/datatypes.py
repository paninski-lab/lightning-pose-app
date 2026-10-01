"""Core Pydantic data models shared across the backend."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class ProjectConfig(BaseModel):
    """Class to the project config"""

    view_names: list[str] = []
    keypoint_names: list[str] = []
    # Raw YAML value. A strict pair type would reject the whole project file
    # when a hand-edited skeleton is invalid, so validity is checked separately.
    skeleton: Any = None
    schema_version: int = 0


class ProjectPaths(BaseModel):
    """Filesystem paths for a project's data and model directories."""

    data_dir: Path
    # Rather than passing None for omitted user value, you must omit the key
    # This allows serialization via
    model_dir: Path = Field(default_factory=lambda data: data["data_dir"] / "models")


class Project(BaseModel):
    """A fully resolved project combining its registry key, paths, and config."""

    project_key: str

    paths: ProjectPaths
    config: ProjectConfig
