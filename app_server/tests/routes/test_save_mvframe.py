"""save_mvframe must not silently drop keypoints that are absent from the CSV."""

from __future__ import annotations

import pandas as pd
from fastapi.testclient import TestClient


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
