"""save_mvframe: reject unknown keypoints, skip blank sidecar lines, and commit all views or none."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from litpose_app.routes.labeler.save_mvframe import (
    SaveFrameViewRequest,
    SaveMvFrameRequest,
    _save_mvframe_sync,
)
from litpose_app.utils import file_transaction
from litpose_app.utils.file_transaction import CommitRollbackError
from litpose_app.utils.mv_label_file import (
    AddToUnlabeledFileView,
    LabelingQueueEntry,
    add_to_unlabeled_sidecar_files,
    label_files_lock,
)

_real_replace = os.replace


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

    request.unlabeledQueueDeletionOnly = True
    _save_mvframe_sync(request, tmp_path)
    assert sidecar.read_bytes() == b"\n"

    keep = {"frame_path": "labeled-data/vid/img0002.jpg", "predictions": None}
    drop = {"frame_path": frame, "predictions": None}
    sidecar.write_text("\n" + json.dumps(keep) + "\n" + json.dumps(drop) + "\n")
    _save_mvframe_sync(request, tmp_path)
    remaining = [
        json.loads(line) for line in sidecar.read_text().splitlines() if line.strip()
    ]
    assert remaining == [keep]


FRAME = "labeled-data/sess1_{view}/img00000042.png"
QUEUED = "labeled-data/sess1_{view}/img00000050.png"


def _multiview_files(data_dir: Path) -> dict[str, Path]:
    """Two views, each with a labeled frame 42 and a sidecar that queues frames 42 and 50."""
    columns = pd.MultiIndex.from_arrays(
        [["user"] * 4, ["nose", "nose", "tail", "tail"], ["x", "y", "x", "y"]]
    )
    files = {}
    for view in ("camA", "camB"):
        csv = data_dir / f"CollectedData_{view}.csv"
        pd.DataFrame(
            [[1.0, 2.0, 3.0, 4.0]], index=[FRAME.format(view=view)], columns=columns
        ).to_csv(csv)
        sidecar = csv.with_suffix(".unlabeled.jsonl")
        sidecar.write_text(
            "".join(
                json.dumps({"frame_path": p.format(view=view), "predictions": None})
                + "\n"
                for p in (FRAME, QUEUED)
            )
        )
        files[f"{view} csv"] = csv
        files[f"{view} sidecar"] = sidecar
    return files


def _save_request(files: dict[str, Path]) -> dict:
    return {
        "projectKey": "demo",
        "views": [
            {
                "csvPath": str(files[f"{view} csv"]),
                "indexToChange": FRAME.format(view=view),
                "changedKeypoints": [{"name": "nose", "x": 10, "y": 20}],
            }
            for view in ("camA", "camB")
        ],
    }


def _snapshot(files: dict[str, Path]) -> dict[str, bytes]:
    return {name: path.read_bytes() for name, path in files.items()}


def _leftovers(data_dir: Path) -> list[str]:
    return sorted(p.name for p in data_dir.iterdir() if p.suffix in (".tmp", ".bak"))


def test_save_mvframe_multiview_success(client: TestClient, register_project):
    """Both views get the new keypoint, both sidecars drop the frame, and no temp or backup files remain."""
    data_dir = register_project("demo")
    files = _multiview_files(data_dir)

    resp = client.post("/app/v0/rpc/save_mvframe", json=_save_request(files))

    assert resp.status_code == 200
    for view in ("camA", "camB"):
        df = pd.read_csv(files[f"{view} csv"], header=[0, 1, 2], index_col=0)
        assert df.loc[FRAME.format(view=view), ("user", "nose", "x")] == 10
        queued = [
            json.loads(line)["frame_path"]
            for line in files[f"{view} sidecar"].read_text().splitlines()
        ]
        assert queued == [QUEUED.format(view=view)]
    assert _leftovers(data_dir) == []


@pytest.mark.parametrize(
    "failing", ["camA csv", "camB csv", "camA sidecar", "camB sidecar"]
)
def test_save_mvframe_failed_replace_restores_every_file(
    client: TestClient, register_project, monkeypatch, failing: str
):
    """A failure replacing any CSV or sidecar leaves all four files byte-for-byte unchanged."""
    data_dir = register_project("demo")
    files = _multiview_files(data_dir)
    before = _snapshot(files)

    def replace(src, dst):
        if Path(dst) == files[failing]:
            raise OSError(f"injected failure replacing {dst}")
        return _real_replace(src, dst)

    monkeypatch.setattr(file_transaction.os, "replace", replace)
    with pytest.raises(OSError, match="injected"):
        client.post("/app/v0/rpc/save_mvframe", json=_save_request(files))

    assert _snapshot(files) == before
    assert _leftovers(data_dir) == []


def test_save_mvframe_unrestorable_failure_names_files_and_keeps_backups(
    client: TestClient, register_project, monkeypatch
):
    """If a restore also fails, the error names the file and its backup stays on disk."""
    data_dir = register_project("demo")
    files = _multiview_files(data_dir)
    old_camA_csv = files["camA csv"].read_bytes()

    def replace(src, dst):
        if Path(dst) == files["camB csv"] or Path(src).suffix == ".bak":
            raise OSError("injected")
        return _real_replace(src, dst)

    monkeypatch.setattr(file_transaction.os, "replace", replace)
    with pytest.raises(CommitRollbackError) as info:
        client.post("/app/v0/rpc/save_mvframe", json=_save_request(files))

    backup = info.value.unrestored[files["camA csv"]]
    assert backup is not None and backup.read_bytes() == old_camA_csv
    assert str(files["camA csv"]) in str(info.value)
    assert _leftovers(data_dir) == [backup.name]


def test_save_mvframe_rejected_view_leaves_no_temp_files(
    client: TestClient, register_project
):
    """A view rejected while staging (unknown keypoint) leaves every file unchanged and no temp files."""
    data_dir = register_project("demo")
    files = _multiview_files(data_dir)
    before = _snapshot(files)
    request = _save_request(files)
    request["views"][1]["changedKeypoints"] = [{"name": "pawAL", "x": 1, "y": 1}]

    resp = client.post("/app/v0/rpc/save_mvframe", json=request)

    assert resp.status_code == 400
    assert _snapshot(files) == before
    assert _leftovers(data_dir) == []


def test_save_mvframe_deletes_the_last_labeled_frame(
    client: TestClient, register_project
):
    """Deleting the only row passes the staged-file check and leaves an empty label table."""
    data_dir = register_project("demo")
    files = _multiview_files(data_dir)
    request = _save_request(files)
    for v in request["views"]:
        v["changedKeypoints"] = []
        v["delete"] = True

    resp = client.post("/app/v0/rpc/save_mvframe", json=request)

    assert resp.status_code == 200
    df = pd.read_csv(files["camA csv"], header=[0, 1, 2], index_col=0)
    assert len(df) == 0
    assert _leftovers(data_dir) == []


def test_extract_frames_queue_update_waits_for_a_save(tmp_path: Path):
    """Adding to the unlabeled queue waits while a save holds the label files lock."""
    csv = tmp_path / "CollectedData.csv"
    view = AddToUnlabeledFileView(
        csvPath=csv,
        entriesToAdd=[LabelingQueueEntry(frame_path="labeled-data/v/img1.png")],
    )
    done = threading.Event()

    def add():
        add_to_unlabeled_sidecar_files([view])
        done.set()

    with label_files_lock:
        worker = threading.Thread(target=add)
        worker.start()
        assert not done.wait(0.2)
    worker.join(timeout=5)
    assert done.is_set()
    assert csv.with_suffix(".unlabeled.jsonl").exists()


def test_queue_with_backslash_and_slash_entries_counts_the_frame_once(tmp_path: Path):
    """A frame queued with \\ (written on Windows) and requested again with / is not added
    twice, and saving it removes every spelling from the queue."""
    csv = tmp_path / "CollectedData.csv"
    sidecar = csv.with_suffix(".unlabeled.jsonl")
    windows = {"frame_path": "labeled-data\\v\\img1.png", "predictions": None}
    other = {"frame_path": "labeled-data/v/img2.png", "predictions": None}
    sidecar.write_text(json.dumps(windows) + "\n" + json.dumps(other) + "\n")
    before = sidecar.read_bytes()

    add_to_unlabeled_sidecar_files(
        [
            AddToUnlabeledFileView(
                csvPath=csv,
                entriesToAdd=[LabelingQueueEntry(frame_path="labeled-data/v/img1.png")],
            )
        ]
    )
    assert sidecar.read_bytes() == before

    csv.write_text("header\n")
    request = SaveMvFrameRequest(
        projectKey="p",
        views=[
            SaveFrameViewRequest(
                csvPath=csv,
                indexToChange="labeled-data/v/img1.png",
                changedKeypoints=[],
            )
        ],
    )
    request.unlabeledQueueDeletionOnly = True
    _save_mvframe_sync(request, tmp_path)
    remaining = [json.loads(line) for line in sidecar.read_text().splitlines() if line]
    assert remaining == [other]


def test_queue_entry_reads_backslashes_as_slashes():
    entry = LabelingQueueEntry(frame_path="labeled-data\\v\\img1.png")
    assert entry.frame_path == "labeled-data/v/img1.png"
