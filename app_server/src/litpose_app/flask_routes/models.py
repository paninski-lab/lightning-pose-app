from __future__ import annotations

from pathlib import Path
from pydantic import BaseModel


class LegacyProjectInfo(BaseModel):
    """Information about the active project."""

    data_dir: Path | None = None
    model_dir: Path | None = None
    views: list[str] | None = None
    keypoint_names: list[str] | None = None


class LegacyGetProjectInfoResponse(BaseModel):
    projectInfo: LegacyProjectInfo


class LegacySetProjectInfoRequest(BaseModel):
    projectInfo: LegacyProjectInfo

class SessionImportRequest(BaseModel):
    localVideoPath: Path

class RGlobRequest(BaseModel):
    baseDir: Path
    pattern: str
    noDirs: bool = False
    stat: bool = False


class RGlobResponseEntry(BaseModel):
    path: Path

    # Present only if request had stat=True or noDirs=True
    type: str | None

    # Present only if request had stat=True
    size: int | None
    # Creation timestamp, ISO format.
    cTime: str | None
    # Modified timestamp, ISO format.
    mTime: str | None


class RGlobResponse(BaseModel):
    entries: list[RGlobResponseEntry]
    # This is the same base_dir that was in the request.
    relativeTo: Path
