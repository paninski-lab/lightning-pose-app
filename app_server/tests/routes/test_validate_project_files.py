"""Validation reports for project file sectors."""

import tomli
import tomli_w
import yaml
from fastapi.testclient import TestClient


def test_validate_label_csv_flags_bad_header(
    client: TestClient, register_project, override_config
):
    """A CollectedData_<view>.csv with a bad header is reported; a well-formed one is not.

    A CSV under data_dir/models is omitted even when the project model directory is elsewhere.
    """
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    image = data_dir / "labeled-data" / "sess_bot" / "img0001.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"png")
    (data_dir / "CollectedData_bot.csv").write_text(
        "scorer,s,s\n"
        "bodyparts,nose,nose\n"
        "coords,x,y\n"
        "labeled-data/sess_bot/img0001.png,1,2\n"
    )
    (data_dir / "CollectedData_bot_test.csv").write_text("a,b\n1,2\n")
    model_copy = data_dir / "models" / "model_0" / "CollectedData_bot.csv"
    model_copy.parent.mkdir(parents=True)
    model_copy.write_text("scorer\nbodyparts\ncoords\n")
    projects_path = override_config.PROJECTS_TOML_PATH
    projects = tomli.loads(projects_path.read_text())
    projects["demo"]["model_dir"] = str(data_dir.parent / "other-models")
    projects_path.write_text(tomli_w.dumps(projects))

    resp = client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "labels"},
    )
    assert resp.status_code == 200, resp.text
    items = {item["path"]: item for item in resp.json()["items"]}
    assert items["CollectedData_bot.csv"]["issues"] == []
    assert items["CollectedData_bot_test.csv"]["issues"]
    assert "models/model_0/CollectedData_bot.csv" not in items


def test_validate_calibration_toml_flags_missing_camera_field(
    client: TestClient, register_project
):
    """A calibration file CameraGroup cannot load is reported; a matching one is not."""
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    cal_dir = data_dir / "calibrations"
    cal_dir.mkdir()
    (cal_dir / "sess.toml").write_text(
        "[cam_0]\n"
        'name = "bot"\n'
        "size = [100, 80]\n"
        "matrix = [[1.0, 0.0, 50.0], [0.0, 1.0, 40.0], [0.0, 0.0, 1.0]]\n"
        "distortions = [0.0, 0.0, 0.0, 0.0, 0.0]\n"
        "rotation = [0.0, 0.0, 0.0]\n"
        "translation = [0.0, 0.0, 1.0]\n"
    )
    (cal_dir / "broken.toml").write_text('[cam_0]\nname = "bot"\n')
    backup = cal_dir / "backups" / "old.toml"
    backup.parent.mkdir()
    backup.write_text("not a calibration\n")

    resp = client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "calibration"},
    )
    assert resp.status_code == 200, resp.text
    items = {item["path"]: item for item in resp.json()["items"]}
    assert "calibrations/backups/old.toml" not in items
    assert items["calibrations/sess.toml"]["issues"] == []
    assert items["calibrations/broken.toml"]["issues"]


def _valid_label(data_dir):
    image = data_dir / "labeled-data" / "sess_bot" / "img0001.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"png")
    csv = data_dir / "CollectedData_bot.csv"
    csv.write_text(
        "scorer,s,s\n"
        "bodyparts,nose,nose\n"
        "coords,x,y\n"
        "labeled-data/sess_bot/img0001.png,1,2\n"
    )
    return csv, image


def test_cached_ok_is_dropped_when_the_label_file_changes(client, register_project):
    """A cached clean label file is not shown as OK after the CSV on disk is broken."""
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    csv, _image = _valid_label(data_dir)
    checked = client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "labels"},
    )
    assert checked.status_code == 200, checked.text
    assert checked.json()["items"][0]["issues"] == []
    fresh = client.post(
        "/app/v0/rpc/cachedProjectFileChecks",
        json={"projectKey": "demo", "sector": "labels"},
    )
    assert fresh.status_code == 200, fresh.text
    assert fresh.json()["items"] == [
        {"path": "CollectedData_bot.csv", "issues": [], "warnings": []}
    ]

    csv.write_text("a,b\n1,2\n")
    cached = client.post(
        "/app/v0/rpc/cachedProjectFileChecks",
        json={"projectKey": "demo", "sector": "labels"},
    )
    assert cached.status_code == 200, cached.text
    ok = [
        item
        for item in cached.json()["items"]
        if item["path"] == "CollectedData_bot.csv" and item["issues"] == []
    ]
    assert ok == []


def test_cached_ok_is_dropped_when_a_labeled_image_disappears(client, register_project):
    """Deleting a frame does not change the CSV, and the cached OK must not survive that."""
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    _csv, image = _valid_label(data_dir)
    client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "labels"},
    )
    image.unlink()
    cached = client.post(
        "/app/v0/rpc/cachedProjectFileChecks",
        json={"projectKey": "demo", "sector": "labels"},
    )
    assert cached.status_code == 200, cached.text
    assert cached.json()["items"] == []


def test_cached_ok_is_dropped_when_keypoints_change(client, register_project):
    """The same CSV is not OK after project keypoints change."""
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    _valid_label(data_dir)
    client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "labels"},
    )
    (data_dir / "project.yaml").write_text(
        yaml.safe_dump({"view_names": ["bot"], "keypoint_names": ["tail"]})
    )
    cached = client.post(
        "/app/v0/rpc/cachedProjectFileChecks",
        json={"projectKey": "demo", "sector": "labels"},
    )
    assert cached.status_code == 200, cached.text
    assert cached.json()["items"] == []


def test_validate_label_csv_hides_only_unusable_files(client, register_project):
    """A readable CSV with a missing image stays available. An unreadable one does not.

    A file in a subdirectory is omitted while LABEL_CSV_SCOPE is root.
    """
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    good = (
        "scorer,s,s\n"
        "bodyparts,nose,nose\n"
        "coords,x,y\n"
        "labeled-data/sess/img0001.png,1,2\n"
    )
    (data_dir / "CollectedData copy.csv").write_text(good)
    (data_dir / "notes.csv").write_text("a,b\n1,2\n")
    nested = data_dir / "extra"
    nested.mkdir()
    (nested / "CollectedData copy.csv").write_text(good)

    resp = client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "labels"},
    )
    assert resp.status_code == 200, resp.text
    items = {item["path"]: item for item in resp.json()["items"]}
    assert "extra/CollectedData copy.csv" not in items
    copied = items["CollectedData copy.csv"]
    assert copied["issues"] == []
    assert any("Missing images" in warning for warning in copied["warnings"])
    assert items["notes.csv"]["issues"]

    found = client.post("/app/v0/rpc/findLabelFiles", json={"projectKey": "demo"})
    assert found.status_code == 200, found.text
    assert found.json()["labelFiles"] == ["CollectedData copy.csv"]


def test_validate_accepts_every_lp_image_format_and_warns_for_lp_only(
    client, register_project
):
    """#164: .JPG, .jpeg, .webp and .tif frames are frames; TIFF gets a can't-show warning."""
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    folder = data_dir / "labeled-data" / "sess_bot"
    folder.mkdir(parents=True)
    names = ["img0001.JPG", "img0002.jpeg", "img0003.webp", "img0004.tif"]
    for name in names:
        (folder / name).write_bytes(b"x")
    (folder / "notes.txt").write_text("not a frame")
    (data_dir / "CollectedData_bot.csv").write_text(
        "scorer,s,s\nbodyparts,nose,nose\ncoords,x,y\n"
        + "".join(f"labeled-data/sess_bot/{name},1,2\n" for name in names)
    )

    labels = client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "labels"},
    ).json()["items"][0]
    assert labels["issues"] == []
    assert not any("do not match" in w for w in labels["warnings"])
    tiff = [w for w in labels["warnings"] if w.startswith("TIFF frames")]
    assert len(tiff) == 1 and "img0004.tif" in tiff[0]
    assert "img0001.JPG" not in tiff[0]

    folder_check = client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "labeled-data"},
    ).json()["items"][0]
    assert folder_check["issues"] == ["Unexpected file: notes.txt"]
    assert len(folder_check["warnings"]) == 1
    assert folder_check["warnings"][0].startswith("TIFF frames train in Lightning Pose")


def test_cached_check_from_older_rules_is_dropped(client, register_project, monkeypatch):
    """A result saved under older validation rules is not shown as current."""
    from litpose_app import project_cache

    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    _valid_label(data_dir)
    client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "labels"},
    )
    monkeypatch.setattr(
        project_cache, "FILE_CHECK_RULES", project_cache.FILE_CHECK_RULES + 1
    )
    cached = client.post(
        "/app/v0/rpc/cachedProjectFileChecks",
        json={"projectKey": "demo", "sector": "labels"},
    )
    assert cached.status_code == 200, cached.text
    assert cached.json()["items"] == []
