"""Calibration routes use calibration_paths: calibrations/<session>.toml,
calibration.toml as LP's fallback, and backups in calibrations/backups/."""

from __future__ import annotations

import re
from pathlib import Path

from aniposelib.cameras import CameraGroup
from fastapi.testclient import TestClient

from litpose_app.datatypes import Project, ProjectConfig, ProjectPaths
from litpose_app.routes.labeler import find_calibration_file


def _camera_group_toml(tmp_path: Path) -> str:
    path = tmp_path / "cg.toml"
    group = CameraGroup.from_names(["top", "side"])
    for camera in group.cameras:
        camera.set_size((640, 480))
    group.dump(str(path))
    return path.read_text()


def test_session_calibration_first_then_project_file(tmp_path: Path):
    project = Project(
        project_key="p",
        paths=ProjectPaths(data_dir=tmp_path),
        config=ProjectConfig(view_names=["top", "side"], schema_version=1),
    )
    assert find_calibration_file("mouse1", project) is None
    (tmp_path / "calibration.toml").write_text("")
    assert find_calibration_file("mouse1", project) == tmp_path / "calibration.toml"
    (tmp_path / "calibrations").mkdir()
    (tmp_path / "calibrations" / "mouse1.toml").write_text("")
    assert find_calibration_file("mouse1", project) == tmp_path / "calibrations/mouse1.toml"


def test_saving_a_session_calibration_backs_up_into_calibrations_backups(
    client: TestClient, register_project, tmp_path: Path
):
    data_dir = register_project("p", views=["top", "side"])
    toml = _camera_group_toml(tmp_path)
    (data_dir / "calibrations").mkdir()
    (data_dir / "calibrations" / "mouse1.toml").write_text(toml)

    response = client.post(
        "/app/v0/rpc/saveCalibrationForSession",
        json={"projectKey": "p", "sessionKey": "mouse1", "newCgToml": toml},
    )

    assert response.status_code == 200
    backups = sorted(p.name for p in (data_dir / "calibrations" / "backups").iterdir())
    assert len(backups) == 1
    assert re.fullmatch(r"mouse1\.\d{8}-\d{6}\.toml", backups[0])
    assert not (data_dir / "calibration_backups").exists()


def test_rename_and_import_write_calibrations_session_toml(
    client: TestClient, register_project, tmp_path: Path, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    data_dir = register_project("p", views=["top", "side"])
    source = tmp_path / "incoming" / "sess.toml"
    source.parent.mkdir()
    source.write_text(_camera_group_toml(tmp_path))
    imported = client.post(
        "/app/v0/rpc/importCalibrationFile",
        json={"projectKey": "p", "serverPath": str(source), "destination": "session"},
    )
    project_file = client.post(
        "/app/v0/rpc/importCalibrationFile",
        json={"projectKey": "p", "serverPath": str(source), "destination": "project"},
    )
    assert imported.status_code == 200, imported.text
    assert Path(imported.json()["path"]) == data_dir / "calibrations/sess.toml"
    assert project_file.status_code == 200, project_file.text
    assert Path(project_file.json()["path"]) == data_dir / "calibration.toml"

    renamed = client.post(
        "/app/v0/rpc/renameCalibrationFile",
        json={
            "projectKey": "p",
            "path": imported.json()["path"],
            "newFilename": "mouse1.toml",
        },
    )
    assert renamed.status_code == 200, renamed.text
    assert Path(renamed.json()["path"]).resolve() == (data_dir / "calibrations/mouse1.toml").resolve()

    upper = client.post(
        "/app/v0/rpc/renameCalibrationFile",
        json={"projectKey": "p", "path": renamed.json()["path"], "newFilename": "mouse2.TOML"},
    )
    # LP looks for calibrations/<session>.toml, so the extension is written in lower case.
    assert upper.status_code == 200, upper.text
    assert Path(upper.json()["path"]).name == "mouse2.toml"

    refused = client.post(
        "/app/v0/rpc/renameCalibrationFile",
        json={"projectKey": "p", "path": str(data_dir / "calibration.toml"), "newFilename": "x.toml"},
    )
    assert refused.status_code == 400
    assert refused.json()["detail"] == "Choose a calibration file inside calibrations/."
