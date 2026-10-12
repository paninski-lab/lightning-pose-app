"""Rename a labeled-data folder and the label CSV paths that point at it."""

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
