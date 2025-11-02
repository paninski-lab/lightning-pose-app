from __future__ import annotations

from pathlib import Path
from pydantic import BaseModel, Field


class LegacyProjectInfo(BaseModel):
    """Information about the active project."""
    project_key: str | None = None
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


# --- New models for Flask-migrated routes ---
class GetYamlFileQuery(BaseModel):
    file_path: Path = Field(alias="file_path")


class FFProbeRequest(BaseModel):
    path: Path


class FFProbeResponse(BaseModel):
    codec: str | None
    width: int | None
    height: int | None
    fps: int | None
    duration: float | None


# Labeler: writeMultifile
class FileToWrite(BaseModel):
    filename: str
    contents: str


class WriteMultifileRequest(BaseModel):
    views: list[FileToWrite]


# Labeler: save_mvframe
class Keypoint(BaseModel):
    name: str
    # null over the wire; we allow None and coerce at business logic layer
    x: float | None = None
    y: float | None = None


class SaveFrameViewRequest(BaseModel):
    csvPath: Path
    indexToChange: str
    changedKeypoints: list[Keypoint]


class SaveMvFrameRequest(BaseModel):
    views: list[SaveFrameViewRequest]


# Labeler: multiview_autolabel
class Point2D(BaseModel):
    x: float
    y: float


class Point3D(BaseModel):
    x: float
    y: float
    z: float


class KPLabel(BaseModel):
    view: str
    point: Point2D


class KPProjectedLabel(BaseModel):
    view: str
    originalPoint: Point2D | None = None
    projectedPoint: Point2D | None = None
    reprojection_error: float | None = None


class KeypointForRequest(BaseModel):
    keypointName: str
    labels: list[KPLabel]


class KeypointForResponse(BaseModel):
    keypointName: str
    triangulatedPt: Point3D | None = None
    projections: list[KPProjectedLabel] | None = None


class GetMVAutoLabelsRequest(BaseModel):
    sessionKey: str
    keypoints: list[KeypointForRequest]


class GetMVAutoLabelsResponse(BaseModel):
    keypoints: list[KeypointForResponse]


# Models (training artifacts)
from typing import Literal

StatusLiteral = Literal[
    "PENDING",
    "STARTING",
    "STARTED",
    "TRAINING",
    "EVALUATING",
    "COMPLETED",
    "FAILED",
    "CANCELED",
    "PAUSED",
]


class TrainStatus(BaseModel):
    status: StatusLiteral
    pid: int | None = None


class CreateTrainTaskRequest(BaseModel):
    modelName: str
    configYaml: str


class CreateTrainTaskResponse(BaseModel):
    ok: bool


class ModelListResponseEntry(BaseModel):
    model_name: str
    model_relative_path: str
    config: dict | None
    created_at: str
    status: TrainStatus | None = None


class ListModelsResponse(BaseModel):
    models: list[ModelListResponseEntry]


# Labeler: bundle_adjust
from litpose_app.tasks.extract_frames import MVLabelFile  # reuse existing model

class BundleAdjustRequest(BaseModel):
    mvlabelfile: MVLabelFile
    sessionKey: str


class BundleAdjustResponse(BaseModel):
    camList: list[str]
    oldReprojectionError: list[float]
    newReprojectionError: list[float]


# Extract Frames
from litpose_app.tasks.extract_frames import (
    Session,
    SessionView,
    RandomMethodOptions,
    LabelFileView,
)


class LabelFileCreationRequest(BaseModel):
    """
    Request to create label file if it does not exist.
    Multiview project filenames should contain a '*' to represent view name.
    """
    labelFileTemplate: str


class ExtractFramesRequest(BaseModel):
    labelFileCreationRequest: LabelFileCreationRequest | None = None
    session: Session
    labelFile: MVLabelFile | None = None
    method: str
    options: RandomMethodOptions
