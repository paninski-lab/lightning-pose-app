"""Abstract base class for project path utilities."""

from __future__ import annotations

from abc import ABC
from pathlib import Path
from typing import TYPE_CHECKING

from litpose_app.paths import ResourceUtil

if TYPE_CHECKING:

    from lightning_pose.data.datatypes import (
        FrameKey,
        LabelFileKey,
        SessionKey,
        VideoFileKey,
        ViewName,
    )


class PathUtil(ABC):
    """Base class for resource path management utils."""

    @staticmethod
    def for_version(
        schema_version: int, is_multiview: bool, base_dir: Path | str | None = None
    ) -> PathUtil:
        """Return the appropriate PathUtil subclass for the given schema version."""
        if schema_version == 1:
            raise NotImplementedError("Not yet implemented")
        elif schema_version == 0:
            from litpose_app.paths.path_util_legacy import PathUtilLegacy

            return PathUtilLegacy(is_multiview=is_multiview, base_dir=base_dir)
        else:
            raise ValueError(f"Unrecognized version: {schema_version}")

    is_multiview: bool
    base_dir: Path | None

    def __init__(self, is_multiview: bool, base_dir: Path | None = None) -> None:
        """Initialize with multiview flag and optional base directory."""
        self.is_multiview = is_multiview
        self.base_dir = base_dir

    videos: ResourceUtil[VideoFileKey]
    video_boxes: ResourceUtil[VideoFileKey]
    frames: ResourceUtil[FrameKey]
    label_files: ResourceUtil[tuple[LabelFileKey, ViewName | None]]
    label_file_bboxes: ResourceUtil[tuple[LabelFileKey, ViewName | None]]
    center_frames: ResourceUtil[VideoFileKey]
    calibrations: ResourceUtil[SessionKey]
    project_calibration: ResourceUtil[None]
    calibration_backups: ResourceUtil[tuple[SessionKey, int]]
