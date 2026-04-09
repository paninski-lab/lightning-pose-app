"""
End-to-end leaning tests for project routes.

These tests exercise the real route logic with minimal dependency overrides.
We only redirect the config path to a temporary location so that file IO
does not touch user/system paths.
"""

from __future__ import annotations

import toml
import yaml
from fastapi.testclient import TestClient


def test_get_project_info(register_project, client: TestClient):
    project_key = "foo"
    data_dir = register_project(
        project_key, views=["camA", "camB"], keypoints=["nose", "ear_left"]
    )

    payload = {
        "projectKey": project_key,
    }

    resp = client.post("/app/v0/rpc/getProjectInfo", json=payload)
    assert resp.status_code == 200
    resp_json = resp.json()

    assert resp_json["projectInfo"] == {
        "data_dir": str(data_dir),
        "model_dir": str(data_dir / "models"),
        "views": ["camA", "camB"],
        "keypoint_names": ["nose", "ear_left"],
    }


def test_update_project_paths_adds_to_projects_toml(
    client: TestClient, override_config, tmp_path
):
    # data dir exists and has project.yaml, but is NOT in projects.toml
    data_dir = tmp_path / "sometestpath"
    data_dir.mkdir(parents=True, exist_ok=True)
    with open(data_dir / "project.yaml", "w") as f:
        yaml.safe_dump({"view_names": ["camA"]}, f)

    # send a request to add existing project paths to projects.toml
    payload = {
        "projectKey": "demo-project",
        "data_dir": str(data_dir),
    }

    resp = client.post("/app/v0/rpc/UpdateProjectPaths", json=payload)
    assert resp.status_code == 200
    assert resp.json() is None

    # Verify the TOML file contents updated
    with open(override_config.PROJECTS_TOML_PATH, "r") as f:
        data = toml.load(f)
        assert data == {"demo-project": {"data_dir": str(data_dir)}}


def test_register_existing_project_adds_to_projects_toml(
    client: TestClient, override_config, tmp_path
):
    # data dir exists and has project.yaml, but is NOT in projects.toml
    data_dir = tmp_path / "sometestpath"
    data_dir.mkdir(parents=True, exist_ok=True)
    with open(data_dir / "project.yaml", "w") as f:
        yaml.safe_dump({"view_names": ["camA"]}, f)

    # send a request to add existing project paths to projects.toml
    payload = {
        "projectKey": "demo-project",
        "data_dir": str(data_dir),
    }

    resp = client.post("/app/v0/rpc/RegisterExistingProject", json=payload)
    assert resp.status_code == 200
    assert resp.json() is None

    # Verify the TOML file contents updated
    with open(override_config.PROJECTS_TOML_PATH, "r") as f:
        data = toml.load(f)
        assert data == {"demo-project": {"data_dir": str(data_dir)}}


def test_register_existing_project_with_model_dir_adds_to_projects_toml(
    client: TestClient, override_config, tmp_path
):
    # data dir and model dir exist, and has project.yaml, but is NOT in projects.toml
    data_dir = tmp_path / "sometestpath_data"
    data_dir.mkdir(parents=True, exist_ok=True)
    model_dir = tmp_path / "sometestpath_models"
    model_dir.mkdir(parents=True, exist_ok=True)
    with open(data_dir / "project.yaml", "w") as f:
        yaml.safe_dump({"view_names": ["camA"]}, f)

    # send a request to add existing project paths to projects.toml
    payload = {
        "projectKey": "demo-project-with-model",
        "data_dir": str(data_dir),
        "model_dir": str(model_dir),
    }

    resp = client.post("/app/v0/rpc/RegisterExistingProject", json=payload)
    assert resp.status_code == 200
    assert resp.json() is None

    # Verify the TOML file contents updated
    with open(override_config.PROJECTS_TOML_PATH, "r") as f:
        data = toml.load(f)
        assert data == {
            "demo-project-with-model": {
                "data_dir": str(data_dir),
                "model_dir": str(model_dir),
            }
        }


def test_update_project_config_patches_yaml(
    client: TestClient, register_project, tmp_path
):
    project_key = "demo-project"
    data_dir = register_project(project_key, views=["camA"])

    payload = {
        "projectKey": project_key,
        "projectInfo": {
            "keypoint_names": ["nose", "ear_left"],
        },
    }

    resp = client.post("/app/v0/rpc/UpdateProjectConfig", json=payload)
    assert resp.status_code == 200
    assert resp.json() is None

    # Verify the YAML file contents
    project_info_yaml = data_dir / "project.yaml"
    with open(project_info_yaml, "r") as f:
        data = yaml.safe_load(f)

    assert data == {
        "view_names": ["camA"],
        "keypoint_names": ["nose", "ear_left"],
    }


def test_create_new_project_requires_info_and_writes_yaml(
    client: TestClient, override_config, tmp_path
):
    # start with empty projects.toml
    override_config.PROJECTS_TOML_PATH.unlink(missing_ok=True)

    data_dir = tmp_path / "new_project"

    payload = {
        "projectKey": "new-project",
        "data_dir": str(data_dir),
        "projectInfo": {
            # paths here should be ignored in YAML
            "data_dir": str(data_dir),
            # include user metadata
            "views": ["camA", "camB"],
            "keypoint_names": ["nose", "ear_left"],
        },
    }

    resp = client.post("/app/v0/rpc/CreateNewProject", json=payload)
    assert resp.status_code == 200
    assert resp.json() is None

    # Verify directories created
    assert data_dir.is_dir()
    assert (data_dir / "models").is_dir()

    # Verify config files copied
    assert (data_dir / "configs").is_dir()
    assert (data_dir / "configs" / "config_default.yaml").exists()
    assert (data_dir / "configs" / "config_default_multiview.yaml").exists()

    # Verify project.yaml created with merged info and schema_version 1
    with open(data_dir / "project.yaml", "r") as f:
        y = yaml.safe_load(f)
    assert y == {
        "schema_version": 1,
        "view_names": ["camA", "camB"],
        "keypoint_names": ["nose", "ear_left"],
    }

    # Verify projects.toml updated
    import toml

    with open(override_config.LP_SYSTEM_DIR / "projects.toml", "r") as f:
        data = toml.load(f)
    assert data == {"new-project": {"data_dir": str(data_dir)}}


def test_update_project_config_errors_if_missing_yaml_on_path_change(
    client: TestClient, register_project, tmp_path, override_config
):
    # setup the projects TOML file contents with initial path
    project_key = "demo-project"
    old_data_dir = register_project(project_key, views=["camA"], keypoints=["paw"])

    # choose a new data dir and ensure it exists (but no project.yaml)
    new_data_dir = tmp_path / "moved_project"
    new_data_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "projectKey": project_key,
        "projectInfo": {
            # request path change
            "data_dir": str(new_data_dir),
            # update metadata too
            "keypoint_names": ["nose"],
        },
    }

    resp = client.post("/app/v0/rpc/UpdateProjectConfig", json=payload)
    assert resp.status_code == 404
    assert "Project configuration file not found" in resp.json()["detail"]

    # Verify projects.toml NOT updated to new path due to early error
    with open(override_config.PROJECTS_TOML_PATH, "r") as f:
        data = toml.load(f)
    assert data == {project_key: {"data_dir": str(old_data_dir)}}


def test_update_project_config_updates_paths_and_metadata_when_yaml_exists(
    client: TestClient, register_project, tmp_path, override_config
):
    # setup the projects TOML file contents with initial path
    project_key = "demo-project"
    old_data_dir = register_project(project_key, views=["camA"], keypoints=["paw"])

    # choose a new data dir and ensure it exists for writing
    new_data_dir = tmp_path / "moved_project"
    new_data_dir.mkdir(parents=True, exist_ok=True)

    # Pre-create project.yaml at new location (simulating it was moved there)
    new_project_yaml = new_data_dir / "project.yaml"
    with open(new_project_yaml, "w") as f:
        yaml.safe_dump({"view_names": ["camA"], "keypoint_names": ["paw"]}, f)

    payload = {
        "projectKey": project_key,
        "projectInfo": {
            # request path change
            "data_dir": str(new_data_dir),
            # update metadata too
            "keypoint_names": ["nose"],
        },
    }

    resp = client.post("/app/v0/rpc/UpdateProjectConfig", json=payload)
    assert resp.status_code == 200
    assert resp.json() is None

    # Verify projects.toml updated to new path
    with open(override_config.PROJECTS_TOML_PATH, "r") as f:
        data = toml.load(f)
    assert data == {project_key: {"data_dir": str(new_data_dir)}}

    # Verify new project.yaml updated
    with open(new_project_yaml, "r") as f:
        updated_data = yaml.safe_load(f)
    assert updated_data["keypoint_names"] == ["nose"]
