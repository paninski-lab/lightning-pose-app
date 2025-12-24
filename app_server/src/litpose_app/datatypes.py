from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field


class ProjectConfig(BaseModel):
    """Class to the project config"""

    view_names: list[str] = []
    keypoint_names: list[str] = []
    schema_version: int = 0


class ProjectPaths(BaseModel):
    data_dir: Path
    # Rather than passing None for omitted user value, you must omit the key
    # This allows serialization via
    model_dir: Path = Field(default_factory=lambda data: data["data_dir"] / "models")


class Project(BaseModel):
    project_key: str

    paths: ProjectPaths
    config: ProjectConfig
