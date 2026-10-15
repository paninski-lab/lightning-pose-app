"""save_mvframe: reject unknown keypoints; skip blank unlabeled sidecar lines."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

from litpose_app.routes.labeler.save_mvframe import (
    SaveFrameViewRequest,
    SaveMvFrameRequest,
    remove_from_unlabeled_sidecar_files,
)


def test_save_mvframe_rejects_keypoint_missing_from_columns(
    client: TestClient, register_project
):
    data_dir = register_project("demo", keypoints=["nose", "tail"])
    csv_path = data_dir / "CollectedData.csv"
    columns = pd.MultiIndex.from_arrays(
        [
            ["user", "user", "user", "user"],
            ["nose", "nose", "tail", "tail"],
            ["x", "y", "x", "y"],
        ]
    )
    frame = "labeled-data/session/img000.png"
    pd.DataFrame([[1, 2, 3, 4]], index=[frame], columns=columns).to_csv(csv_path)
    before = csv_path.read_bytes()

    resp = client.post(
        "/app/v0/rpc/save_mvframe",
        json={
            "projectKey": "demo",
            "views": [
                {
                    "csvPath": str(csv_path),
                    "indexToChange": frame,
                    "changedKeypoints": [{"name": "pawAL", "x": 5, "y": 6}],
                }
            ],
        },
    )

    assert resp.status_code == 400
    assert "pawAL" in resp.json()["detail"]
    assert csv_path.read_bytes() == before


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
