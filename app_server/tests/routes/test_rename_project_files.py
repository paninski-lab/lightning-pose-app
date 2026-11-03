"""Rename a labeled-data folder and the label CSV paths that point at it."""

import json
from pathlib import Path

from fastapi.testclient import TestClient


def test_rename_labeled_data_folder_rewrites_csv_paths(
    client: TestClient, register_project
):
    """A valid folder rename updates labeled-data/old/ paths and leaves old_extra alone.

    A bad new name is rejected and nothing moves. The three header rows stay as stored.
    """
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    old = data_dir / "labeled-data" / "old"
    extra = data_dir / "labeled-data" / "old_extra"
    old.mkdir(parents=True)
    extra.mkdir(parents=True)
    (old / "img0001.png").write_bytes(b"png")
    (extra / "img0001.png").write_bytes(b"png")
    header = "scorer,s,s\nbodyparts,nose,nose\ncoords,x,y\n"
    csv_path = data_dir / "CollectedData_bot.csv"
    csv_path.write_text(
        header
        + "labeled-data/old/img0001.png,1,2\n"
        + "labeled-data/old_extra/img0001.png,3,4\n"
    )
    model_csv = data_dir / "models" / "CollectedData_bot.csv"
    model_csv.parent.mkdir()
    model_csv.write_text(header + "labeled-data/old/img0001.png,9,9\n")
    original_model = model_csv.read_text()

    bad = client.post(
        "/app/v0/rpc/renameLabeledDataFolder",
        json={"projectKey": "demo", "path": str(old), "newName": "nope"},
    )
    assert bad.status_code == 400, bad.text
    assert old.is_dir()
    assert "labeled-data/old/img0001.png,1,2" in csv_path.read_text()

    ok = client.post(
        "/app/v0/rpc/renameLabeledDataFolder",
        json={"projectKey": "demo", "path": str(old), "newName": "sess_bot"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["path"].endswith("labeled-data/sess_bot")
    assert not old.exists()
    assert (data_dir / "labeled-data" / "sess_bot" / "img0001.png").is_file()
    assert (extra / "img0001.png").is_file()

    text = csv_path.read_text()
    assert text.splitlines()[:3] == [
        "scorer,s,s",
        "bodyparts,nose,nose",
        "coords,x,y",
    ]
    assert "labeled-data/sess_bot/img0001.png,1,2" in text
    assert "labeled-data/old_extra/img0001.png,3,4" in text
    assert "labeled-data/old/" not in text
    assert model_csv.read_text() == original_model



_HEADER = "scorer,s,s\nbodyparts,nose,nose\ncoords,x,y\n"


def _rename(client: TestClient, path: Path, new_name: str):
    return client.post(
        "/app/v0/rpc/renameLabeledDataFolder",
        json={"projectKey": "demo", "path": str(path), "newName": new_name},
    )


def _labeled_folder(data_dir: Path, name: str = "old") -> Path:
    folder = data_dir / "labeled-data" / name
    folder.mkdir(parents=True)
    (folder / "img0001.png").write_bytes(b"png")
    return folder


def test_rename_labeled_data_folder_rewrites_label_csvs_outside_the_data_root(
    client: TestClient, register_project
):
    """A CSV inside the renamed folder (DLC layout) and one in a subfolder are rewritten too."""
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    old = _labeled_folder(data_dir)
    inside = old / "CollectedData_rick.csv"
    inside.write_text(_HEADER + "labeled-data/old/img0001.png,1,2\n")
    nested = data_dir / "labels" / "CollectedData_bot.csv"
    nested.parent.mkdir()
    nested.write_text(_HEADER + "labeled-data/old/img0001.png,3,4\n")

    assert _rename(client, old, "sess_bot").status_code == 200

    moved = data_dir / "labeled-data" / "sess_bot" / "CollectedData_rick.csv"
    assert "labeled-data/sess_bot/img0001.png,1,2" in moved.read_text()
    assert "labeled-data/sess_bot/img0001.png,3,4" in nested.read_text()


def test_rename_labeled_data_folder_rewrites_unlabeled_queues(
    client: TestClient, register_project
):
    """Queued frames follow the folder; other entries and unreadable lines stay as stored."""
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    old = _labeled_folder(data_dir)
    (data_dir / "CollectedData_bot.csv").write_text(_HEADER)
    queue = data_dir / "CollectedData_bot.unlabeled.jsonl"
    other = '{"frame_path": "labeled-data/old_extra/img0002.png"}\n'
    queue.write_text(
        '{"frame_path": "labeled-data/old/img0002.png", "predictions": null}\n'
        + '{"frame_path": "labeled-data\\\\old\\\\img0003.png"}\n'
        + other
        + "not json\n"
    )
    model_queue = data_dir / "models" / "m1" / "CollectedData_bot.unlabeled.jsonl"
    model_queue.parent.mkdir(parents=True)
    model_queue.write_text('{"frame_path": "labeled-data/old/img0002.png"}\n')
    original_model_queue = model_queue.read_text()

    assert _rename(client, old, "sess_bot").status_code == 200

    lines = queue.read_text().splitlines(keepends=True)
    assert [json.loads(line)["frame_path"] for line in lines[:2]] == [
        "labeled-data/sess_bot/img0002.png",
        "labeled-data/sess_bot/img0003.png",
    ]
    assert json.loads(lines[0])["predictions"] is None
    assert lines[2:] == [other, "not json\n"]
    assert model_queue.read_text() == original_model_queue


def test_rename_labeled_data_folder_keeps_crlf_line_endings(
    client: TestClient, register_project
):
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    old = _labeled_folder(data_dir)
    csv_path = data_dir / "CollectedData_bot.csv"
    csv_path.write_bytes(
        _HEADER.replace("\n", "\r\n").encode()
        + b"labeled-data/old/img0001.png,1,2\r\n"
    )

    assert _rename(client, old, "sess_bot").status_code == 200

    assert csv_path.read_bytes().endswith(b"labeled-data/sess_bot/img0001.png,1,2\r\n")
    assert b"\r\n" in csv_path.read_bytes().split(b"labeled-data")[0]


def test_rename_labeled_data_folder_failed_commit_changes_nothing(
    client: TestClient, register_project, monkeypatch
):
    """If the files can't be committed, the folder moves back and every file is unchanged."""
    from litpose_app.routes import rename_project_files

    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    old = _labeled_folder(data_dir)
    csv_path = data_dir / "CollectedData_bot.csv"
    csv_path.write_text(_HEADER + "labeled-data/old/img0001.png,1,2\n")
    queue = data_dir / "CollectedData_bot.unlabeled.jsonl"
    queue.write_text('{"frame_path": "labeled-data/old/img0002.png"}\n')
    before = {path: path.read_text() for path in (csv_path, queue)}

    def fail(_staged):
        raise OSError("disk full")

    monkeypatch.setattr(rename_project_files, "replace_files", fail)
    resp = _rename(client, old, "sess_bot")

    assert resp.status_code == 500
    assert old.is_dir() and not (data_dir / "labeled-data" / "sess_bot").exists()
    assert {path: path.read_text() for path in before} == before
    assert not list(data_dir.rglob("*.tmp"))


def test_import_calibration_creates_folder_and_copies_toml(
    client: TestClient, register_project, tmp_path: Path, monkeypatch
):
    """A server .toml is copied into a new calibrations/ directory.

    The copy of a file CameraGroup cannot load still succeeds and reports a format issue.
    A second import of the same name returns 409 and leaves the first file unchanged.
    """
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    data_dir = register_project("demo", views=["bot"])
    source = tmp_path / "incoming" / "sess.toml"
    source.parent.mkdir()
    original = 'name = "bot"\n'
    source.write_text(original)
    assert not (data_dir / "calibrations").exists()

    payload = {"projectKey": "demo", "serverPath": str(source)}
    first = client.post("/app/v0/rpc/importCalibrationFile", json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["issues"]
    copied = data_dir / "calibrations" / "sess.toml"
    assert copied.read_text() == original
    assert source.is_file()
    assert not (data_dir / "calibration.toml").exists()

    source.write_text("changed = true\n")
    second = client.post("/app/v0/rpc/importCalibrationFile", json=payload)
    assert second.status_code == 409, second.text
    assert copied.read_text() == original
    assert source.read_text() == "changed = true\n"


def test_import_calibration_project_file_and_overwrite(
    client: TestClient, register_project, tmp_path: Path, monkeypatch
):
    """A project-file copy lands at calibration.toml and does not create calibrations/.

    A second copy without overwrite returns 409. A copy with overwrite replaces the contents.
    """
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    data_dir = register_project("demo", views=["bot"])
    source = tmp_path / "incoming" / "other.toml"
    source.parent.mkdir()
    original = 'name = "bot"\n'
    source.write_text(original)

    payload = {
        "projectKey": "demo",
        "serverPath": str(source),
        "destination": "project",
    }
    first = client.post("/app/v0/rpc/importCalibrationFile", json=payload)
    assert first.status_code == 200, first.text
    copied = data_dir / "calibration.toml"
    assert copied.read_text() == original
    assert source.is_file()
    assert not (data_dir / "calibrations").exists()

    source.write_text("changed = true\n")
    second = client.post("/app/v0/rpc/importCalibrationFile", json=payload)
    assert second.status_code == 409, second.text
    assert copied.read_text() == original
    assert not (data_dir / "calibrations").exists()

    replaced = client.post(
        "/app/v0/rpc/importCalibrationFile",
        json={**payload, "overwrite": True},
    )
    assert replaced.status_code == 200, replaced.text
    assert copied.read_text() == "changed = true\n"
    assert source.read_text() == "changed = true\n"
    assert not (data_dir / "calibrations").exists()
    assert not list(data_dir.glob(".calibration-*"))


def test_import_label_and_model_copy_without_overwrite(
    client: TestClient, register_project, tmp_path: Path, monkeypatch
):
    """A label CSV and a model folder are copied in, and a second copy does not replace them."""
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    image = data_dir / "labeled-data" / "sess_bot" / "img0001.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"png")
    label_src = tmp_path / "incoming" / "CollectedData_bot.csv"
    label_src.parent.mkdir()
    label_body = (
        "scorer,s,s\n"
        "bodyparts,nose,nose\n"
        "coords,x,y\n"
        "labeled-data/sess_bot/img0001.png,1,2\n"
    )
    label_src.write_text(label_body)

    label_payload = {"projectKey": "demo", "serverPath": str(label_src)}
    first_label = client.post("/app/v0/rpc/importLabelFile", json=label_payload)
    assert first_label.status_code == 200, first_label.text
    copied_label = data_dir / "CollectedData_bot.csv"
    assert copied_label.read_text() == label_body
    assert label_src.is_file()

    label_src.write_text("changed\n")
    second_label = client.post("/app/v0/rpc/importLabelFile", json=label_payload)
    assert second_label.status_code == 409, second_label.text
    assert copied_label.read_text() == label_body

    model_src = tmp_path / "incoming" / "model_a"
    model_src.mkdir()
    (model_src / "config.yaml").write_text("model: demo\n")
    model_payload = {"projectKey": "demo", "serverPath": str(model_src)}
    first_model = client.post("/app/v0/rpc/importModelDirectory", json=model_payload)
    assert first_model.status_code == 200, first_model.text
    copied_config = data_dir / "models" / "model_a" / "config.yaml"
    assert copied_config.read_text() == "model: demo\n"
    assert (model_src / "config.yaml").is_file()

    (model_src / "config.yaml").write_text("model: changed\n")
    second_model = client.post("/app/v0/rpc/importModelDirectory", json=model_payload)
    assert second_model.status_code == 409, second_model.text
    assert copied_config.read_text() == "model: demo\n"
    assert (model_src / "config.yaml").read_text() == "model: changed\n"
