"""Saving a labeled frame must ignore blank lines in the unlabeled sidecar."""

import asyncio
import json
from pathlib import Path

from litpose_app.routes.labeler.save_mvframe import (
    SaveFrameViewRequest,
    SaveMvFrameRequest,
    remove_from_unlabeled_sidecar_files,
)


def test_save_mvframe_skips_blank_unlabeled_sidecar_lines(tmp_path: Path):
    """A newline-only sidecar does not fail the save, and a blank line does not hide a queued frame."""
    csv_path = tmp_path / "CollectedData.csv"
    csv_path.write_text("header\n")
    sidecar = csv_path.with_suffix(".unlabeled.jsonl")
    sidecar.write_text("\n")
    frame = "labeled-data/vid/img0001.jpg"
    request = SaveMvFrameRequest(
        projectKey="p",
        views=[
            SaveFrameViewRequest(
                csvPath=csv_path,
                indexToChange=frame,
                changedKeypoints=[],
            )
        ],
    )

    asyncio.run(remove_from_unlabeled_sidecar_files(tmp_path, request))
    assert sidecar.read_bytes() == b"\n"

    keep = {"frame_path": "labeled-data/vid/img0002.jpg", "predictions": None}
    drop = {"frame_path": frame, "predictions": None}
    sidecar.write_text("\n" + json.dumps(keep) + "\n" + json.dumps(drop) + "\n")
    asyncio.run(remove_from_unlabeled_sidecar_files(tmp_path, request))
    remaining = [
        json.loads(line) for line in sidecar.read_text().splitlines() if line.strip()
    ]
    assert remaining == [keep]
