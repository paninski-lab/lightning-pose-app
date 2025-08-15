from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Callable

from pydantic import BaseModel

from litpose_app.config import Config
from litpose_app.utils.video.frame_selection import frame_selection_kmeans_impl


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


def extract_frames_task(
    config: Config,
    session: Session,
    mv_label_file,
    progress_callback: Callable[[str], None],
    method="random",
    options: RandomMethodOptions = DEFAULT_RANDOM_OPTIONS,
):
    """
    session: dict (serialized Session model)
    method: random (kmeans) | active (NYI)
    """

    frame_idxs: list[int] = []
    with ProcessPoolExecutor(max_workers=config.N_WORKERS) as process_pool:
        if method == "random":
            frame_idxs = _frame_selection_kmeans(config, session, options, process_pool)
            progress_callback(f"Frame selection complete.")
        else:
            raise ValueError("method not supported: " + method)

        result = _export_frames(config, session, frame_idxs, process_pool)
        progress_callback(f"Frame extraction complete.")
        _update_unlabeled_files(result, mv_label_file)
        progress_callback(f"Update unlabeled files complete.")


def _frame_selection_kmeans(config, session, options, process_pool) -> list[int]:
    """
    Select `options.n_frames` frames using just the first video in the session.

    Offload it to a separate process because this is CPU-intensive.
    """

    future = process_pool.submit(
        frame_selection_kmeans_impl,
        config,
        session.views[0].video_path,
        options.n_frames,
    )
    return future.result()


def _export_frames(config, session, frame_idxs, process_pool) -> dict[str, list[Path]]:
    """
    Extracts frames (frame_idxs) from each view.

    Each view's video is processed independently by the process pool (CPU intensive).
    Frames are written to temp files until all frames are extracted from all views.
    Then all temp files are moved to their final destination.

    Returns a dict of view_name -> list of paths to extracted frames (relative to data dir).
    """
    return {}


def _update_unlabeled_files(result: dict[str, list[Path]], mv_label_file: MVLabelFile):
    """
    Appends the new frames in `result` to the `mv_label_file` as atomically as possible.
    """
    pass
