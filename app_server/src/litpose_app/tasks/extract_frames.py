import logging
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Callable

import cv2
import numpy as np
from pydantic import BaseModel

from litpose_app.config import Config
from litpose_app.routes.project import ProjectInfo
from litpose_app.utils.mv_label_file import (
    AddToUnlabeledFileView,
    add_to_unlabeled_sidecar_files,
)
from litpose_app.utils.video import video_capture
from litpose_app.utils.video.export_frames import export_frames_singleview_impl
from litpose_app.utils.video.frame_selection import frame_selection_kmeans_impl

logger = logging.getLogger(__name__)


class SessionView(BaseModel):
    videoPath: Path
    viewName: str


class Session(BaseModel):
    views: list[SessionView]


class LabelFileView(BaseModel):
    csvPath: Path
    viewName: str


class MVLabelFile(BaseModel):
    views: list[LabelFileView]


class RandomMethodOptions(BaseModel):
    nFrames: int = 10


DEFAULT_RANDOM_OPTIONS = RandomMethodOptions()

# Other configuration


def extract_frames_task(
    config: Config,
    session: Session,
    project_info: ProjectInfo,
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
    with ProcessPoolExecutor(
        max_workers=min(config.N_WORKERS, len(session.views))
    ) as process_pool:
        if method == "random":
            frame_idxs = _frame_selection_kmeans(config, session, options, process_pool)
            progress_callback(f"Frame selection complete.")
        else:
            raise ValueError("method not supported: " + method)

        result = _export_frames(config, session, project_info, frame_idxs, process_pool)
        progress_callback(f"Frame extraction complete.")
        logger.debug(result)
        _update_unlabeled_files(project_info.data_dir, result, mv_label_file)
        progress_callback(f"Update unlabeled files complete.")


def _frame_selection_kmeans(config, session, options, process_pool) -> list[int]:
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
    project_info: ProjectInfo,
    frame_idxs,
    process_pool,
) -> dict[str, list[Path]]:
    """
    Extracts frames (frame_idxs) from each view.

    Work is executed by process pool: one task per camera view.
    Tasks write to temp files.
    Upon all tasks finishing, the temp files are moved to final destination (atomic).

    Returns a dict of view_name -> list of paths to extracted center frames (relative to data dir).
    """

    def dest_path(video_path: Path, frame_idx: int) -> Path:
        return (
            project_info.data_dir
            / config.LABELED_DATA_DIRNAME
            / video_path.stem
            / f"img{frame_idx:0{config.FMT_FRAME_INDEX_DIGITS}d}.jpg"
        )

    # Compute destination paths for center frames as the return value of the function.
    retval = {
        sv.viewName: [dest_path(sv.videoPath, frame_idx) for frame_idx in frame_idxs]
        for sv in session.views
    }

    def get_frame_count(video_path: Path) -> int:
        with video_capture(video_path) as cap:
            return int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    frame_count = get_frame_count(session.views[0].videoPath)

    # expand frame_idxs to include context frames
    context_frames = config.FRAME_EXTRACT_N_CONTEXT_FRAMES
    if context_frames > 0:
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
    for view_name, future in futures.items():
        future.result()

    return retval


def _update_unlabeled_files(
    data_dir: Path, result: dict[str, list[Path]], mv_label_file: MVLabelFile
):
    """
    Appends the new frames in `result` to the `mv_label_file` as atomically as possible.
    """
    lfv_dict = {lfv.viewName: lfv for lfv in mv_label_file.views}
    x = [
        AddToUnlabeledFileView(
            csvPath=lfv_dict[view_name].csvPath,
            framePathsToAdd=[str(p.relative_to(data_dir)) for p in result[view_name]],
        )
        for view_name in result
    ]
    add_to_unlabeled_sidecar_files(x)
