import logging
from pathlib import Path

import cv2
import numpy as np

from litpose_app.config import Config
from litpose_app.utils.video import video_capture

logger = logging.getLogger(__name__)


def export_frames_singleview_impl(
    config: Config, video_path: Path, frame_idxs: np.ndarray, dest_paths: list[Path]
):
    with video_capture(video_path) as cap:
        frames = get_frames_from_idxs(cap, frame_idxs)
    for frame, dest_path in zip(frames, dest_paths):
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(
            filename=str(dest_path),
            img=cv2.cvtColor(frame.transpose(1, 2, 0), cv2.COLOR_RGB2BGR),
        )


def get_frames_from_idxs(cap: cv2.VideoCapture, idxs: np.ndarray) -> np.ndarray:
    """Helper function to load video segments.

    Parameters
    ----------
    cap : cv2.VideoCapture object
    idxs : array-like
        frame indices into video

    Returns
    -------
    np.ndarray
        returned frames of shape (n_frames, n_channels, ypix, xpix)

    """
    is_contiguous = np.sum(np.diff(idxs)) == (len(idxs) - 1)
    n_frames = len(idxs)
    for fr, i in enumerate(idxs):
        if fr == 0 or not is_contiguous:
            cap.set(1, i)
        ret, frame = cap.read()
        if ret:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            if fr == 0:
                height, width, _ = frame_rgb.shape
                frames = np.zeros((n_frames, 3, height, width), dtype="uint8")
            frames[fr] = frame_rgb.transpose(2, 0, 1)
        else:
            logger.error(
                "Reached end of video; returning blank frames for remainder of requested indices"
            )
            break
    return frames
