from contextlib import contextmanager
from pathlib import Path

import cv2


@contextmanager
def video_capture(video_path: Path):
    """
    Automates checking for file existence and releasing the video capture object.
    """
    assert video_path.is_file()
    cap = cv2.VideoCapture(str(video_path))

    if not cap.isOpened():
        raise RuntimeError(f"Error opening video file {video_path}")

    try:
        yield cap
    finally:
        cap.release()
