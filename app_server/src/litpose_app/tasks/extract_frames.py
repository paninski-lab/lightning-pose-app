"""Frame extraction task: selects and exports frames from videos into labeled-data directories."""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from collections.abc import Callable, Sequence
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from numpy.typing import NDArray
from pydantic import BaseModel

from litpose_app.config import Config
from litpose_app.datatypes import Project
from litpose_app.utils.mv_label_file import (
    AddToUnlabeledFileView,
    ExtractedFramePredictionList,
    LabelingQueueEntry,
    add_to_unlabeled_sidecar_files,
)
from litpose_app.utils.video import video_capture
from litpose_app.utils.video.export_frames import export_frames_singleview_impl
from litpose_app.utils.video.frame_selection import frame_selection_kmeans_impl

logger = logging.getLogger(__name__)


class SessionView(BaseModel):
    """A single camera view within a recording session."""

    videoPath: Path
    viewName: str


class Session(BaseModel):
    """A recording session consisting of one or more camera views."""

    views: list[SessionView]


class LabelFileView(BaseModel):
    """Path to the label CSV for one view in a multi-view label file."""

    csvPath: Path
    viewName: str


class MVLabelFile(BaseModel):
    """Collection of per-view label file paths for a multi-view project."""

    views: list[LabelFileView]


class RandomMethodOptions(BaseModel):
    """Options for k-means random frame selection."""

    nFrames: int = 10


class ManualMethodOptions(BaseModel):
    """Options for manual frame selection by explicit index list."""
    frame_index_list: list[int] = []

    # Optional predictions to store in the unlabeled queue.
    # Powers extract from viewer functionality.
    # Requires frame_index_list above to be length 1.
    predictions: dict[str, ExtractedFramePredictionList] | None = None


DEFAULT_RANDOM_OPTIONS = RandomMethodOptions()


class ExtractedFrameConflict(Exception):
    """Center frames that are already a label row or a queue entry."""

    def __init__(self, paths: list[str]) -> None:
        self.paths = paths
        super().__init__(conflict_detail(paths))


def missing_session_views(session: Session, project: Project) -> list[str]:
    """Project camera names this session does not include. Empty when the session is complete.

    A project with no camera views is single-view and needs exactly one session view.
    """
    expected = list(project.config.view_names)
    present = {view.viewName for view in session.views}
    if expected:
        return [name for name in expected if name not in present]
    if len(session.views) == 1:
        return []
    return ["one camera"]


def session_view_message(session: Session, project: Project) -> str | None:
    """Why this session cannot be extracted, or None when it matches the project."""
    missing = missing_session_views(session, project)
    expected = list(project.config.view_names)
    if expected:
        if missing:
            return f"Session is missing views: {', '.join(missing)}."
        extra = sorted({view.viewName for view in session.views} - set(expected))
        if extra:
            return f"Session has views that are not in the project: {', '.join(extra)}."
        return None
    if missing:
        return "Single-view project requires exactly one session view."
    return None


def known_frame_paths(data_dir: Path, mv_label_file: MVLabelFile) -> set[str]:
    """Relative paths already stored as label rows or unlabeled-queue entries."""
    found: set[str] = set()
    for view in mv_label_file.views:
        csv_path = Path(view.csvPath)
        if csv_path.is_file():
            try:
                table = pd.read_csv(csv_path, header=[0, 1, 2], index_col=0)
            except Exception:
                table = None
            if table is not None:
                for raw in table.index:
                    normalized = _normalize_frame_path(str(raw), data_dir)
                    if normalized is not None:
                        found.add(normalized)
        sidecar = csv_path.with_suffix(".unlabeled.jsonl")
        if not sidecar.is_file():
            continue
        for line in sidecar.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            normalized = _normalize_frame_path(str(payload.get("frame_path", "")), data_dir)
            if normalized is not None:
                found.add(normalized)
    return found


def planned_frame_paths(
    session: Session,
    frame_idxs: Sequence[int],
    config: Config,
    project: Project,
) -> set[str]:
    """Relative paths of the center frames this extract would queue."""
    width = config.FMT_FRAME_INDEX_DIGITS
    folder = config.LABELED_DATA_DIRNAME
    planned: set[str] = set()
    for view in session.views:
        stem = Path(view.videoPath).stem
        for index in frame_idxs:
            relative = f"{folder}/{stem}/img{int(index):0{width}d}.jpg"
            planned.add(relative)
    return planned


def conflicting_frame_paths(
    project: Project,
    mv_label_file: MVLabelFile,
    session: Session,
    frame_idxs: Sequence[int],
    config: Config,
) -> list[str]:
    """Sorted center-frame paths that are already labeled or queued."""
    known = known_frame_paths(project.paths.data_dir, mv_label_file)
    planned = planned_frame_paths(session, frame_idxs, config, project)
    return sorted(known & planned)


def conflict_detail(paths: list[str]) -> str:
    """Short 409 message naming at most two conflicting paths."""
    shown = ", ".join(paths[:2])
    extra = len(paths) - 2
    suffix = f" (+{extra} more)" if extra > 0 else ""
    return f"Frame already in the label file or labeling queue: {shown}{suffix}"


def _normalize_frame_path(raw: str, data_dir: Path) -> str | None:
    text = raw.strip().replace("\\", "/")
    if text in {"", "nan", "None"}:
        return None
    path = Path(text)
    if path.is_absolute():
        try:
            return path.resolve().relative_to(data_dir.resolve()).as_posix()
        except ValueError:
            return None
    return path.as_posix()

# Other configuration


def extract_frames_task(
    config: Config,
    session: Session,
    project: Project,
    mv_label_file: MVLabelFile,
    progress_callback: Callable[[str], None],
    method: str = "random",
    options: RandomMethodOptions = DEFAULT_RANDOM_OPTIONS,
    manual_frame_options: ManualMethodOptions = ManualMethodOptions(),
) -> None:
    """
    session: dict (serialized Session model)
    method: random (kmeans) | active (NYI)
    """

    frame_idxs: NDArray[np.integer]
    with ProcessPoolExecutor(
        max_workers=min(config.N_WORKERS, len(session.views))
    ) as process_pool:
        if method == "random":
            frame_idxs = _frame_selection_kmeans(config, session, options, process_pool)
            progress_callback("Frame selection complete.")
        elif method == "manual":
            frame_idxs = np.array(manual_frame_options.frame_index_list, dtype=int)
        else:
            raise ValueError("method not supported: " + method)

        conflicts = conflicting_frame_paths(
            project, mv_label_file, session, [int(index) for index in frame_idxs], config
        )
        if conflicts:
            raise ExtractedFrameConflict(conflicts)

        view_to_frame_index_to_path = _export_frames(
            config, session, project, frame_idxs, process_pool
        )
        progress_callback("Frame extraction complete.")
        logger.debug(view_to_frame_index_to_path)
        _update_unlabeled_files(
            project.paths.data_dir,
            view_to_frame_index_to_path,
            mv_label_file,
            manual_frame_options.predictions if manual_frame_options else None,
        )
        progress_callback("Update unlabeled files complete.")


def _frame_selection_kmeans(
    config: Config,
    session: Session,
    options: RandomMethodOptions,
    process_pool: ProcessPoolExecutor,
) -> NDArray[np.integer]:
    """
    Select `options.n_frames` frames using just the first video in the session.

    Offload it to a separate process because this is CPU-intensive.
    """

    future = process_pool.submit(
        frame_selection_kmeans_impl,
        config,
        session.views[0].videoPath,
        options.nFrames,
    )
    return future.result()


def _export_frames(
    config: Config,
    session: Session,
    project: Project,
    frame_idxs: NDArray[np.integer],
    process_pool: ProcessPoolExecutor,
) -> dict[str, dict[int, Path]]:
    """
    Extracts frames (frame_idxs) from each view.

    Work is executed by process pool: one task per camera view.
    Tasks write to temp files.
    Upon all tasks finishing, the temp files are moved to final destination (atomic).

    Returns a dict of view_name -> frame index -> paths to extracted center frames (relative to data dir).
    """

    def dest_path(video_path: Path, frame_idx: int) -> Path:
        """Return the output JPEG path for a single frame from video_path."""
        return (
            project.paths.data_dir
            / config.LABELED_DATA_DIRNAME
            / video_path.stem
            / f"img{frame_idx:0{config.FMT_FRAME_INDEX_DIGITS}d}.jpg"
        )

    # Compute destination paths for center frames as the return value of the function.
    retval = {
        sv.viewName: {
            frame_idx: dest_path(sv.videoPath, frame_idx) for frame_idx in frame_idxs
        }
        for sv in session.views
    }

    def get_frame_count(video_path: Path) -> int:
        """Return the total number of frames in video_path."""
        with video_capture(video_path) as cap:
            return int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    frame_count = get_frame_count(session.views[0].videoPath)

    # expand frame_idxs to include context frames
    context_frames = config.FRAME_EXTRACT_N_CONTEXT_FRAMES
    context_vec = np.arange(-context_frames, context_frames + 1)
    _result = (frame_idxs[None, :] + context_vec[:, None]).flatten()
    _result.sort()
    _result = _result[_result >= 0]
    _result = _result[_result < int(frame_count)]
    _result = np.unique(_result)
    frame_idxs_with_context = _result

    futures = {}
    for sv in session.views:
        # Compute destination paths for every frame including context frames.
        dest_paths = [dest_path(sv.videoPath, idx) for idx in frame_idxs_with_context]
        future = process_pool.submit(
            export_frames_singleview_impl,
            config,
            sv.videoPath,
            frame_idxs_with_context,
            dest_paths,
        )
        futures[sv.viewName] = future

    # Wait for all completion
    for _, future in futures.items():
        future.result()

    return retval


def _update_unlabeled_files(
    data_dir: Path,
    result: dict[str, dict[int, Path]],
    mv_label_file: MVLabelFile,
    predictions: dict[str, ExtractedFramePredictionList] | None = None,
) -> None:
    """
    Appends the new frames in `result` to the `mv_label_file` as atomically as possible.
    """
    lfv_dict = {lfv.viewName: lfv for lfv in mv_label_file.views}
    entriesToAdd = defaultdict(list)
    predictions = predictions or {}
    for view_name in result:
        if len(predictions) > 0:
            assert len(result[view_name]) == 1, (
                "Prediction extraction only supported for manual frame extraction of length 1. Instead, was "
                + str(len(result[view_name]))
            )
        for frame_idx in result[view_name]:
            e = LabelingQueueEntry(
                # as_posix: str() gives \ on Windows, which breaks the project on other OSes.
                frame_path=result[view_name][frame_idx].relative_to(data_dir).as_posix(),
                predictions=predictions.get(view_name),
            )
            entriesToAdd[view_name].append(e)
    x = [
        AddToUnlabeledFileView(
            csvPath=lfv_dict[view_name].csvPath,
            entriesToAdd=entriesToAdd[view_name],
        )
        for view_name in result
    ]
    add_to_unlabeled_sidecar_files(x)
