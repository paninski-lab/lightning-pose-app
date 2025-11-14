"""
End-to-end leaning tests for project routes.

These tests exercise the real route logic with minimal dependency overrides.
We only redirect the config path to a temporary location so that file IO
does not touch user/system paths.
"""

from __future__ import annotations


from pathlib import Path

import toml
import tomli_w
import yaml
from fastapi.testclient import TestClient
from lightning_pose.rootconfig import RootConfig


def test_get_project_info(client: TestClient, override_config, tmp_path):
    # setup the projects TOML file contents
    with open(override_config.LP_SYSTEM_DIR / "projects.toml", "wb") as f:
        data_dir = str(tmp_path / "sometestpath")
        tomli_w.dump({"foo": {"data_dir": data_dir}}, f)

    Path(data_dir).mkdir(parents=True, exist_ok=True)
    with open(Path(data_dir) / "project.yaml", "w") as f:
        yaml.safe_dump(
            {"view_names": ["camA", "camB"], "keypoint_names": ["nose", "ear_left"]}, f
        )

    payload = {
        "projectKey": "foo",
    }

    resp = client.post("/app/v0/rpc/getProjectInfo", json=payload)
    print(resp.json())
    assert resp.status_code == 200
    # Route returns None → encoded as JSON null
    resp = resp.json()

    assert resp["projectInfo"] == {
        "data_dir": data_dir,
        "model_dir": str(Path(data_dir) / "models"),
        "views": ["camA", "camB"],
        "keypoint_names": ["nose", "ear_left"],
    }


def test_set_project_info_adds_existing_project(
    client: TestClient, override_config, tmp_path
):
    # setup the projects TOML file contents: empty
    (override_config.LP_SYSTEM_DIR / "projects.toml").touch()
    data_dir = str(tmp_path / "sometestpath")

    # setup the project data directory: valid
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    with open(Path(data_dir) / "project.yaml", "w") as f:
        yaml.safe_dump({"view_names": ["camA"]}, f)

    # send a request to update paths, not the projectInfo
    payload = {
        "projectKey": "demo-project",
        "projectInfo": {"data_dir": data_dir},
        "delete": False,
    }

    resp = client.post("/app/v0/rpc/setProjectInfo", json=payload)
    assert resp.status_code == 200
    # Route returns None → encoded as JSON null
    assert resp.json() is None

    # Verify the TOML file contents updated
    with open(override_config.LP_SYSTEM_DIR / "projects.toml", "r") as f:
        data = toml.load(f)
        assert data == {"demo-project": {"data_dir": data_dir}}

    # Verify the YAML file contents unchanged
    project_info_yaml = tmp_path / "sometestpath" / "project.yaml"
    with open(project_info_yaml, "r") as f:
        data = yaml.safe_load(f)

    assert data == {
        "view_names": ["camA"],
    }


def test_set_project_info_updates_existing_project(
    client: TestClient, override_config, tmp_path
):
    # setup the projects TOML file contents
    with open(override_config.LP_SYSTEM_DIR / "projects.toml", "wb") as f:
        data_dir = str(tmp_path / "sometestpath")
        tomli_w.dump({"demo-project": {"data_dir": data_dir}}, f)

    Path(data_dir).mkdir(parents=True, exist_ok=True)
    with open(Path(data_dir) / "project.yaml", "w") as f:
        yaml.safe_dump({"view_names": ["camA"]}, f)

    payload = {
        "projectKey": "demo-project",
        "projectInfo": {
            "views": ["camA", "camB"],
            "keypoint_names": ["nose", "ear_left"],
        },
        "delete": False,
    }

    resp = client.post("/app/v0/rpc/setProjectInfo", json=payload)
    assert resp.status_code == 200
    # Route returns None → encoded as JSON null
    assert resp.json() is None

    # Verify the YAML file contents
    project_info_yaml = tmp_path / "sometestpath" / "project.yaml"
    with open(project_info_yaml, "r") as f:
        data = yaml.safe_load(f)

    assert data == {
        "view_names": ["camA", "camB"],
        "keypoint_names": ["nose", "ear_left"],
    }
