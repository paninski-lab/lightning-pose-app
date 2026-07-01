"""Legacy path parser for projects using the pre-V1 unstructured directory layout."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from lightning_pose.data.datatypes import (
    FrameKey,
    LabelFileKey,
    SessionKey,
    VideoFileKey,
    ViewName,
)

from litpose_app.paths import PathParseException, ResourceUtil, ResourceType, _check_relative_and_normalize
from litpose_app.paths.path_util import PathUtil


class PathUtilLegacy(PathUtil):
    """Parser for paths in projects before V1 strict schema."""

    # Legacy parser needs access to view names for parsing.
    view_names: list[str]

    def __init__(self, view_names: list[str], *args: Any, **kwargs: Any) -> None:
        """Initialize with view names and wire up all legacy resource utils."""
        self.view_names = view_names
        super().__init__(is_multiview=len(view_names) > 0, *args, **kwargs)

        # Explicit resource utils for legacy behavior (public attributes)
        self.videos = _LegacyVideoUtil(self)
        self.video_boxes = _LegacyVideoBBoxUtil(self)
        self.frames = _LegacyFrameUtil(self)
        self.label_files = _LegacyLabelFileUtil(self)
        self.label_file_bboxes = _LegacyLabelFileBBoxUtil(self)
        self.center_frames = _LegacyCenterFramesUtil(self)
        self.calibrations = _LegacyCalibrationUtil(self)
        self.project_calibration = _LegacyProjectCalibrationUtil(self)
        self.calibration_backups = _LegacyCalibrationBackupUtil(self)

        self._resource_map: dict[ResourceType, ResourceUtil] = {
            ResourceType.VIDEO: self.videos,
            ResourceType.VIDEO_BBOX: self.video_boxes,
            ResourceType.FRAME: self.frames,
            ResourceType.LABEL_FILE: self.label_files,
            ResourceType.LABEL_FILE_BBOX: self.label_file_bboxes,
            ResourceType.CENTER_FRAME_LIST: self.center_frames,
            ResourceType.CALIBRATION: self.calibrations,
            ResourceType.PROJECT_CALIBRATION: self.project_calibration,
            ResourceType.CALIBRATION_BACKUP: self.calibration_backups,
        }

    def for_(self, resource_type: ResourceType) -> ResourceUtil:
        """Return the resource util for the given resource type."""
        return self._resource_map[resource_type]

    def _parse_session_name_and_view(
        self, potential_session_view_str: str
    ) -> VideoFileKey:
        """Parses a string (like a filename stem or directory name) to extract session key and view.

        Args:
            potential_session_view_str: A string that might contain both the session key and view name,
                                        e.g., "mouse_session_top" or "mouse_session".

        Returns:
            A VideoFileKey containing the extracted session_key and view.
        """
        potential_session_view_str = str(potential_session_view_str)
        if not self.is_multiview:
            return VideoFileKey(
                session_key=SessionKey(potential_session_view_str), view=None
            )

        # In multiview projects, try to find the matching view name
        for view_name in self.view_names:
            if f"_{view_name}" in potential_session_view_str:
                # Replace the view name suffix to get the session key
                session_key = potential_session_view_str.replace(f"_{view_name}", "")
                return VideoFileKey(
                    session_key=SessionKey(session_key), view=ViewName(view_name)
                )

        raise PathParseException()


# ---------------------------------------------------------------------------
# Resource util classes implementing get()/reverse()
# ---------------------------------------------------------------------------


class _LegacyVideoUtil(ResourceUtil[VideoFileKey]):
    """Legacy resource util for top-level .mp4 video files."""

    def __init__(self, schema: PathUtilLegacy) -> None:
        """Initialize with the parent schema for session/view parsing."""
        self._schema = schema

    def get_path(self, key: VideoFileKey) -> Path:
        """Not implemented for legacy layout."""
        raise NotImplementedError()

    def parse_path(self, path: Path | str) -> VideoFileKey:
        """Parse a top-level .mp4 path into a VideoFileKey."""
        path = _check_relative_and_normalize(path)
        if not path.suffix == ".mp4":
            raise PathParseException()
        # Throws away vids-from-labeled-frames
        if len(path.parent.parts) > 1:
            raise PathParseException()
        return self._schema._parse_session_name_and_view(path.stem)


class _LegacyVideoBBoxUtil(ResourceUtil[VideoFileKey]):
    """Legacy resource util for video bounding-box CSV files."""

    def __init__(self, schema: PathUtilLegacy) -> None:
        """Initialize with the parent schema for session/view parsing."""
        self._schema = schema

    def get_path(self, key: VideoFileKey) -> Path:
        """Not implemented for legacy layout."""
        raise NotImplementedError()

    def parse_path(self, path: Path | str) -> VideoFileKey:
        """Parse a _bbox.csv path into a VideoFileKey."""
        path = _check_relative_and_normalize(path)
        if not path.suffix == ".csv":
            raise PathParseException()
        if not path.stem.endswith("_bbox"):
            raise PathParseException()
        stem_without_bbox = path.stem.removesuffix("_bbox")
        return self._schema._parse_session_name_and_view(stem_without_bbox)


class _LegacyFrameUtil(ResourceUtil[FrameKey]):
    """Legacy resource util for labeled-data frame image paths."""

    def __init__(self, schema: PathUtilLegacy) -> None:
        """Initialize with the parent schema for session/view parsing."""
        self._schema = schema

    def get_path(self, key: FrameKey) -> Path:
        """Not implemented for legacy layout."""
        raise NotImplementedError()

    def parse_path(self, path: Path | str) -> FrameKey:
        """Parse a labeled-data frame image path into a FrameKey."""
        path = _check_relative_and_normalize(path)
        # Regex to capture the directory segment containing session and view
        # e.g., "labeled-data/sessionkey_view/" or "labeled-data/sessionkey/"
        pattern = r"[^/]*/(?P<session_view_str>[^/]+)/[a-zA-Z_-]+(?P<frameindex>\d+)\.(png|jpg)"
        m = re.search(pattern, path.as_posix())
        if not m:
            raise PathParseException(
                f"Could not parse label frame path: {path.as_posix()}, multiview={self._schema.is_multiview}"
            )
        session_view_str = m.group("session_view_str")
        video_file_key = self._schema._parse_session_name_and_view(session_view_str)
        frame_index = int(m.group("frameindex"))
        return FrameKey(
            session_key=video_file_key.session_key,
            frame_index=frame_index,
            view=video_file_key.view,
        )


class _LegacyLabelFileUtil(ResourceUtil[tuple[LabelFileKey, ViewName | None]]):
    """Legacy resource util for CollectedData CSV label files."""

    def __init__(self, schema: PathUtilLegacy) -> None:
        """Initialize with the parent schema for session/view parsing."""
        self._schema = schema

    def get_path(self, key_view: tuple[LabelFileKey, ViewName | None]) -> Path:
        """Not implemented for legacy layout."""
        raise NotImplementedError()

    def parse_path(self, path: Path | str) -> tuple[LabelFileKey, ViewName | None]:
        """Parse a label CSV path into a (LabelFileKey, view) tuple."""
        path = _check_relative_and_normalize(path)
        if path.suffix != ".csv":
            raise PathParseException()
        if "calibration" in str(path):
            raise PathParseException()
        if "bbox" in str(path):
            raise PathParseException()
        video_file_key = self._schema._parse_session_name_and_view(path.stem)
        prefix = "_".join(path.parent.parts)
        labelfilekey = "_".join(
            token for token in (prefix, video_file_key.session_key) if token
        )
        return LabelFileKey(labelfilekey), video_file_key.view


class _LegacyLabelFileBBoxUtil(ResourceUtil[tuple[LabelFileKey, ViewName | None]]):
    """Legacy resource util for bboxes_ CSV files paired with label files."""

    def __init__(self, schema: PathUtilLegacy) -> None:
        """Initialize with the parent schema for session/view parsing."""
        self._schema = schema

    def get_path(self, key_view: tuple[LabelFileKey, ViewName | None]) -> Path:
        """Return the bboxes CSV path for the given label file key and view."""
        label_file_key, view = key_view
        # bboxes_lTop.csv, bboxes_new.csv
        tokens = ("bboxes", label_file_key.replace("CollectedData", ""), view)
        return Path("_".join(tokens) + ".csv")

    def parse_path(self, path: Path | str) -> tuple[LabelFileKey, ViewName | None]:
        """Parse a bboxes_ CSV path into a (LabelFileKey, view) tuple."""
        path = _check_relative_and_normalize(path)
        if not Path(path.as_posix()).name.startswith("bboxes_"):
            raise PathParseException()
        video_file_key = self._schema._parse_session_name_and_view(
            Path(path.as_posix()).stem
        )
        labelfilekey = LabelFileKey(
            str(video_file_key.session_key).replace("bboxes", "CollectedData")
        )
        return labelfilekey, video_file_key.view


class _LegacyCenterFramesUtil(ResourceUtil[VideoFileKey]):
    """Legacy resource util for center_frames.txt files inside labeled-data dirs."""

    def __init__(self, schema: PathUtilLegacy) -> None:
        """Initialize with the parent schema for session/view parsing."""
        self._schema = schema

    def get_path(self, key: VideoFileKey) -> Path:
        """Not implemented for legacy layout."""
        raise NotImplementedError()

    def parse_path(self, path: Path | str) -> VideoFileKey:
        """Parse a center_frames.txt path into a VideoFileKey."""
        path = _check_relative_and_normalize(path)
        pattern = r"labeled-data/(?P<session_view_str>[^/]+)/center_frames\.txt"
        m = re.search(pattern, path.as_posix())
        if not m:
            raise PathParseException(
                f"Could not parse center frames path: {path.as_posix()}, multiview={self._schema.is_multiview}"
            )
        session_view_str = m.group("session_view_str")
        return self._schema._parse_session_name_and_view(session_view_str)


class _LegacyCalibrationUtil(ResourceUtil[SessionKey]):
    """Legacy resource util for per-session calibration TOML files."""

    def __init__(self, schema: PathUtilLegacy) -> None:
        """Initialize with the parent schema."""
        self._schema = schema

    def get_path(self, key: SessionKey) -> Path:
        """Return calibrations/<session>.toml."""
        return Path("calibrations") / f"{key}.toml"

    def parse_path(self, path: Path | str) -> SessionKey:
        """Parse a calibrations/<session>.toml path into a SessionKey."""
        path = _check_relative_and_normalize(path)
        pattern = r"calibrations/(?P<session>[^/]+)\.toml"
        m = re.match(pattern, path.as_posix())
        if not m:
            raise PathParseException(
                f"Could not parse session calibration path: {path.as_posix()}"
            )
        return SessionKey(m.group("session"))


class _LegacyProjectCalibrationUtil(ResourceUtil[None]):
    """Legacy resource util for the single project-level calibration.toml."""

    def __init__(self, schema: PathUtilLegacy) -> None:
        """Initialize with the parent schema."""
        self._schema = schema

    def get_path(self) -> Path:  # type: ignore[override]
        """Not implemented for legacy layout."""
        raise NotImplementedError()

    def parse_path(self, path: Path | str) -> None:
        """Parse calibration.toml; raises PathParseException for any other path."""
        path = _check_relative_and_normalize(path)
        pattern = r"calibration\.toml"
        m = re.match(pattern, path.as_posix())
        if not m:
            raise PathParseException()
        return None


class _LegacyCalibrationBackupUtil(ResourceUtil[tuple[SessionKey, int]]):
    """Legacy resource util for timestamped calibration backup TOML files."""

    def __init__(self, schema: PathUtilLegacy) -> None:
        """Initialize with the parent schema."""
        self._schema = schema

    def get_path(self, key: tuple[SessionKey, int]) -> Path:
        """Not implemented for legacy layout."""
        raise NotImplementedError()

    def parse_path(self, path: Path | str) -> tuple[SessionKey, int]:
        """Parse a calibration_backups/<session>.<timestamp>.toml path."""
        path = _check_relative_and_normalize(path)
        pattern = r"calibration_backups/(?P<session>[^/]+)\.(?P<time>\d+)\.toml"
        m = re.match(pattern, path.as_posix())
        if not m:
            raise PathParseException(
                f"Could not parse calibration backup path: {path.as_posix()}"
            )
        return SessionKey(m.group("session")), int(m.group("time"))
