from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from pydantic import BaseModel

from litpose_app.config import Config


class SessionView(BaseModel):
    video_path: Path
    view_name: str


class Session(BaseModel):
    views: list[SessionView]


class LabelFileView(BaseModel):
    csv_path: Path
    view_name: str


class MVLabelFile(BaseModel):
    views: list[LabelFileView]


class RandomMethodOptions(BaseModel):
    n_frames: int = 10


DEFAULT_RANDOM_OPTIONS = RandomMethodOptions()

# Other configuration
FMT_FRAME_INDEX_DIGITS = 8
N_CONTEXT_FRAMES = 2

import os

N_WORKERS = os.cpu_count()


def extract_frames_task(
    config: Config,
    session: dict,
    mv_label_file: dict,
    method="random",
    options: dict | None = None,
):
    """
    session: dict (serialized Session model)
    method: random (kmeans) | active (NYI)
    """
    session = Session(**session)
    mv_label_file = MVLabelFile(**mv_label_file)
    if method == "random":
        options = RandomMethodOptions(**options)
        _extract_frames_task(config, session, mv_label_file, method, options)
    else:
        raise ValueError("method not supported: " + method)


def _extract_frames_task(
    config: Config,
    session: Session,
    mv_label_file,
    method: str,
    options: RandomMethodOptions,
):
    frame_idxs: list[int] = []
    process_pool = ProcessPoolExecutor(max_workers=N_WORKERS)
    if method == "random":
        frame_idxs = _frame_selection_kmeans(config, session, options, process_pool)
    else:
        raise ValueError("method not supported: " + method)

    result = _export_frames(config, session, frame_idxs)
    _update_unlabeled_files(result, mv_label_file)


def _frame_selection_kmeans(config, session, options, process_pool) -> list[int]:
    """
    Select `options.n_frames` frames using just the first video in session.

    Offload it to a separate process because this is CPU intensive."""
    future = process_pool.submit(
        _frame_selection_kmeans_impl, session.views[0].video_path, options.n_frames
    )
    return future.result()


def _frame_selection_kmeans_impl(video_path: Path, n_frames: int) -> list[int]:
    """
    Select `options.n_frames` frames using just the first video in session.

    Runs in a separate process because it's CPU intensive.
    """
    pass


def _export_frames(config, session, frame_idxs, process_pool) -> dict[str, list[Path]]:
    """
    Extracts frames (frame_idxs) from each view.

    Each view's video is processed independently by the process pool (CPU intensive).
    Frames are written to temp files until all frames are extracted from all views.
    Then all temp files are moved to their final destination.

    Returns a dict of view_name -> list of paths to extracted frames (relative to data dir).
    """
    pass


def _update_unlabeled_files(result: dict[str, list[Path]], mv_label_file: MVLabelFile):
    """
    Appends the new frames in `result` to the `mv_label_file` as atomically as possible.
    """
    pass
