"""Validation reports for project file sectors."""

from fastapi.testclient import TestClient


def test_validate_label_csv_flags_bad_header(client: TestClient, register_project):
    """A CollectedData_<view>.csv with a bad header is reported; a well-formed one is not."""
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

    resp = client.post(
        "/app/v0/rpc/validateProjectFiles",
        json={"projectKey": "demo", "sector": "labels"},
    )
    assert resp.status_code == 200, resp.text
    items = {item["path"]: item for item in resp.json()["items"]}
    assert items["CollectedData_bot.csv"]["issues"] == []
    assert items["CollectedData_bot_test.csv"]["issues"]


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
