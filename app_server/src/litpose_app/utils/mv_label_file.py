import os
import time
from concurrent.futures import ThreadPoolExecutor, Future
from pathlib import Path

from pydantic import BaseModel


class AddToUnlabeledFileView(BaseModel):
    # Path of the CSV file who's unlabeled sidecar file needs to be updated
    csvPath: Path
    # String repr of the paths to the frame to add to the unlabeled sidecar file
    # Relative to data dir.
    framePathsToAdd: list[str]


def add_to_unlabeled_sidecar_files(views: list[AddToUnlabeledFileView]):
    """Add frames to the unlabeled sidecar files."""
    timestamp = time.time_ns()

    def add_task(vr: AddToUnlabeledFileView):
        unlabeled_sidecar_file = vr.csvPath.with_suffix(".unlabeled")
        if not unlabeled_sidecar_file.exists():
            lines = []
            needs_save = True
        else:
            needs_save = False
            lines = unlabeled_sidecar_file.read_text().splitlines()

        for framePathToAdd in vr.framePathsToAdd:
            if framePathToAdd not in lines:
                needs_save = True
                lines.append(framePathToAdd)

        if needs_save:
            temp_file_name = f"{unlabeled_sidecar_file.name}.{timestamp}.tmp"
            temp_file_path = unlabeled_sidecar_file.parent / temp_file_name

            temp_file_path.write_text("\n".join(lines) + "\n")
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
            os.replace(temp_file_path, vr.csvPath.with_suffix(".unlabeled"))
