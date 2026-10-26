"""Helpers for atomically updating per-view unlabeled-frame JSONL sidecar files."""

from __future__ import annotations

import json
import logging
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path

from pydantic import BaseModel

from litpose_app.utils.file_transaction import replace_files

logger = logging.getLogger(__name__)

# Held while label CSVs and unlabeled sidecars are read, changed, and replaced,
# so a Labeler save and Extract Frames cannot overwrite each other's changes.
label_files_lock = threading.Lock()


class ExtractedFramePredictionEntry(BaseModel):
    """A single keypoint prediction for one extracted frame."""
    keypoint_name: str
    x: float
    y: float


# When changing this struct, be aware that it's used in ExtractFramesRequest.
class ExtractedFramePredictionList(BaseModel):
    """Predictions from one model for a set of extracted frames."""

    model_name: str
    date_time: int
    predictions: list[ExtractedFramePredictionEntry]


class LabelingQueueEntry(BaseModel):
    """One entry in the unlabeled-frame JSONL sidecar queue."""
    frame_path: str
    predictions: ExtractedFramePredictionList | None = None


class AddToUnlabeledFileView(BaseModel):
    """Specifies which entries to append to one view's unlabeled sidecar file."""
    # Path of the CSV file who's unlabeled sidecar file needs to be updated
    csvPath: Path

    entriesToAdd: list[LabelingQueueEntry]


def add_to_unlabeled_sidecar_files(views: list[AddToUnlabeledFileView]) -> None:
    """Add frames to the unlabeled sidecar files, all views or none."""
    with label_files_lock:
        _add_to_unlabeled_sidecar_files(views)


def _add_to_unlabeled_sidecar_files(views: list[AddToUnlabeledFileView]) -> None:
    timestamp = time.time_ns()

    def add_task(vr: AddToUnlabeledFileView) -> Path | None:
        """Append entries to one view's sidecar and return the temp file path, or None if no change."""
        unlabeled_sidecar_file = vr.csvPath.with_suffix(".unlabeled.jsonl")
        if not unlabeled_sidecar_file.exists():
            entries: list[LabelingQueueEntry] = []
            needs_save = True
        else:
            needs_save = False
            entries = [
                LabelingQueueEntry(**json.loads(line))
                for line in unlabeled_sidecar_file.read_text().splitlines()
                if line.strip()
            ]

        existing_frame_paths = [e.frame_path for e in entries]
        for entry in vr.entriesToAdd:
            if entry.frame_path not in existing_frame_paths:
                needs_save = True
                entries.append(entry)

        if needs_save:
            temp_file_name = f"{unlabeled_sidecar_file.name}.{timestamp}.tmp"
            temp_file_path = unlabeled_sidecar_file.parent / temp_file_name
            temp_file_path.write_text(
                "\n".join(line.model_dump_json() for line in entries) + "\n"
            )
            return temp_file_path
        return None

    futures: list[Future] = []
    with ThreadPoolExecutor() as pool:
        for vr in views:
            futures.append(pool.submit(add_task, vr))
    # All futures are complete after the with block exits (pool.shutdown(wait=True))

    # Collect all results before acting, so we can clean up on partial failure.
    temp_files: list[Path | None] = []
    first_error: Exception | None = None
    for f in futures:
        try:
            temp_files.append(f.result())
        except Exception as e:
            if first_error is None:
                first_error = e
            temp_files.append(None)

    if first_error is not None:
        for tf in temp_files:
            if tf is not None:
                tf.unlink(missing_ok=True)
        raise RuntimeError(
            "Failed to prepare unlabeled sidecar update for one or more views"
        ) from first_error

    # Commit together: if one replace fails, the others are restored.
    replace_files(
        [
            (temp_file, vr.csvPath.with_suffix(".unlabeled.jsonl"))
            for vr, temp_file in zip(views, temp_files, strict=False)
            if temp_file is not None
        ]
    )
