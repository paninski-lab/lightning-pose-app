import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, Future
from pathlib import Path

from pydantic import BaseModel


class LabelingQueueEntry(BaseModel):
    frame_path: str
    predictions: dict[str, list[tuple[str, float, float]]] | None = None


class ExtractedFramePredictionEntry(BaseModel):
    keypoint_name: str
    x: float
    y: float


class ExtractedFramePredictionList(BaseModel):
    model_name: str
    date_time: int
    predictions: list[ExtractedFramePredictionEntry]


class AddToUnlabeledFileView(BaseModel):
    # Path of the CSV file who's unlabeled sidecar file needs to be updated
    csvPath: Path
    # String repr of the paths to the frame to add to the unlabeled sidecar file
    # Relative to data dir.
    framePathsToAdd: list[str]

    # FramePath -> ExtractedFrameContext
    entries: list[LabelingQueueEntry]


def add_to_unlabeled_sidecar_files(views: list[AddToUnlabeledFileView]):
    """Add frames to the unlabeled sidecar files."""
    timestamp = time.time_ns()

    def add_task(vr: AddToUnlabeledFileView):
        unlabeled_sidecar_file = vr.csvPath.with_suffix(".unlabeled.jsonl")
        if not unlabeled_sidecar_file.exists():
            entries: list[LabelingQueueEntry] = []
            needs_save = True
        else:
            needs_save = False
            entries = [
                LabelingQueueEntry(**json.loads(line))
                for line in unlabeled_sidecar_file.read_text().splitlines()
            ]

        existing_frame_paths = [e.frame_path for e in entries]
        for entry in vr.entries:
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
        else:
            return None

    tasks: list[Future] = []
    with ThreadPoolExecutor() as pool:
        for vr in views:
            tasks.append(pool.submit(add_task, vr))

        results = []
        for t in tasks:
            results.append(t.result())

    for vr, temp_file_path in zip(views, results):
        if temp_file_path is not None:
            os.replace(temp_file_path, vr.csvPath.with_suffix(".unlabeled.jsonl"))
