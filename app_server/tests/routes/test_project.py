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


def test_get_project_info(override_config, tmp_path, client: TestClient):
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


def test_add_existing_project_adds_to_projects_toml(
    client: TestClient, override_config, tmp_path
):
    # setup the projects TOML file contents: empty
    (override_config.LP_SYSTEM_DIR / "projects.toml").touch()
    data_dir = str(tmp_path / "sometestpath")

    # setup the project data directory: valid
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    with open(Path(data_dir) / "project.yaml", "w") as f:
        yaml.safe_dump({"view_names": ["camA"]}, f)

    # send a request to add existing project paths to projects.toml
    payload = {
        "projectKey": "demo-project",
        "data_dir": data_dir,
    }

    resp = client.post("/app/v0/rpc/UpdateProjectsTomlEntry", json=payload)
    assert resp.status_code == 200
    # Route returns None → encoded as JSON null
    assert resp.json() is None

    # Verify the TOML file contents updated
    with open(override_config.PROJECTS_TOML_PATH, "r") as f:
        data = toml.load(f)
        assert data == {"demo-project": {"data_dir": data_dir}}

    # Verify the YAML file contents unchanged
    project_info_yaml = tmp_path / "sometestpath" / "project.yaml"
    with open(project_info_yaml, "r") as f:
        data = yaml.safe_load(f)

    assert data == {
        "view_names": ["camA"],
    }


def test_update_project_config_patches_yaml(
    client: TestClient, override_config, tmp_path
):
    # setup the projects TOML file contents
    with open(override_config.PROJECTS_TOML_PATH, "wb") as f:
        data_dir = str(tmp_path / "sometestpath")
        tomli_w.dump({"demo-project": {"data_dir": data_dir}}, f)

    Path(data_dir).mkdir(parents=True, exist_ok=True)
    with open(Path(data_dir) / "project.yaml", "w") as f:
        yaml.safe_dump({"view_names": ["camA"]}, f)

    payload = {
        "projectKey": "demo-project",
        "projectInfo": {
            "keypoint_names": ["nose", "ear_left"],
        },
    }

    resp = client.post("/app/v0/rpc/UpdateProjectConfig", json=payload)
    assert resp.status_code == 200
    # Route returns None → encoded as JSON null
    assert resp.json() is None

    # Verify the YAML file contents
    project_info_yaml = tmp_path / "sometestpath" / "project.yaml"
    with open(project_info_yaml, "r") as f:
        data = yaml.safe_load(f)

    assert data == {
        "view_names": ["camA"],
        "keypoint_names": ["nose", "ear_left"],
    }


def test_create_new_project(client: TestClient, override_config, tmp_path):
    # start with empty projects.toml
    override_config.PROJECTS_TOML_PATH.unlink(missing_ok=True)

    data_dir = tmp_path / "new_project"

    payload = {
        "projectKey": "new-project",
        "data_dir": str(data_dir),
    }

    resp = client.post("/app/v0/rpc/CreateNewProject", json=payload)
    assert resp.status_code == 200
    assert resp.json() is None

    # Verify directories created
    assert data_dir.is_dir()
    assert (data_dir / "models").is_dir()

    # Verify project.yaml created with schema_version 1
    with open(data_dir / "project.yaml", "r") as f:
        y = yaml.safe_load(f)
    assert y == {"schema_version": 1}

    # Verify projects.toml updated
    import toml

    with open(override_config.LP_SYSTEM_DIR / "projects.toml", "r") as f:
        data = toml.load(f)
    assert data == {"new-project": {"data_dir": str(data_dir)}}
