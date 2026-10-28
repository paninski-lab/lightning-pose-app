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
    project_info = resp.json()["projectInfo"]
    project_info.pop("ignored_video_dirs", None)

    assert project_info == {
        "data_dir": str(data_dir),
        "model_dir": str(data_dir / "models"),
        "views": ["camA", "camB"],
        "keypoint_names": ["nose", "ear_left"],
        "skeleton": None,
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
    with open(override_config.PROJECTS_TOML_PATH) as f:
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
    with open(override_config.PROJECTS_TOML_PATH) as f:
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
    with open(override_config.PROJECTS_TOML_PATH) as f:
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
    with open(project_info_yaml) as f:
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
    with open(data_dir / "project.yaml") as f:
        y = yaml.safe_load(f)
    assert y == {
        "schema_version": 1,
        "view_names": ["camA", "camB"],
        "keypoint_names": ["nose", "ear_left"],
    }

    # Verify projects.toml updated
    import toml

    with open(override_config.LP_SYSTEM_DIR / "projects.toml") as f:
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
    with open(override_config.PROJECTS_TOML_PATH) as f:
        data = toml.load(f)
    assert data == {project_key: {"data_dir": str(old_data_dir)}}


def test_update_project_config_updates_paths_and_metadata_when_yaml_exists(
    client: TestClient, register_project, tmp_path, override_config
):
    # setup the projects TOML file contents with initial path
    project_key = "demo-project"
    _ = register_project(project_key, views=["camA"], keypoints=["paw"])

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
    with open(override_config.PROJECTS_TOML_PATH) as f:
        data = toml.load(f)
    assert data == {project_key: {"data_dir": str(new_data_dir)}}

    # Verify new project.yaml updated
    with open(new_project_yaml) as f:
        updated_data = yaml.safe_load(f)
    assert updated_data["keypoint_names"] == ["nose"]


def test_update_project_config_round_trips_skeleton(
    client: TestClient, register_project
):
    project_key = "demo-project"
    data_dir = register_project(
        project_key, keypoints=["nose", "neck", "tail_base"]
    )
    skeleton = [["nose", "neck"], ["neck", "tail_base"]]

    resp = client.post(
        "/app/v0/rpc/UpdateProjectConfig",
        json={
            "projectKey": project_key,
            "projectInfo": {"skeleton": skeleton},
        },
    )
    assert resp.status_code == 200

    with open(data_dir / "project.yaml") as f:
        saved = yaml.safe_load(f)
    assert saved["skeleton"] == skeleton

    info = client.post(
        "/app/v0/rpc/getProjectInfo", json={"projectKey": project_key}
    )
    assert info.status_code == 200
    assert info.json()["projectInfo"]["skeleton"] == skeleton


def test_update_project_config_rejects_bad_skeleton(
    client: TestClient, register_project
):
    project_key = "demo-project"
    data_dir = register_project(project_key, keypoints=["nose", "neck"])
    before = (data_dir / "project.yaml").read_text()

    resp = client.post(
        "/app/v0/rpc/UpdateProjectConfig",
        json={
            "projectKey": project_key,
            "projectInfo": {"skeleton": [["nose", "nose"]]},
        },
    )
    assert resp.status_code == 400
    assert (data_dir / "project.yaml").read_text() == before


def test_project_without_skeleton_loads(client: TestClient, register_project):
    project_key = "demo-project"
    data_dir = register_project(project_key, views=["camA"], keypoints=["nose"])

    loaded = client.post(
        "/app/v0/rpc/getProjectInfo", json={"projectKey": project_key}
    )
    assert loaded.status_code == 200
    assert loaded.json()["projectInfo"]["skeleton"] is None

    resp = client.post(
        "/app/v0/rpc/UpdateProjectConfig",
        json={
            "projectKey": project_key,
            "projectInfo": {"keypoint_names": ["nose", "tail"]},
        },
    )
    assert resp.status_code == 200
    with open(data_dir / "project.yaml") as f:
        saved = yaml.safe_load(f)
    assert "skeleton" not in saved
    assert saved["keypoint_names"] == ["nose", "tail"]


def test_create_and_update_reject_exactly_one_camera_view(
    client: TestClient, register_project, tmp_path
):
    one_view = tmp_path / "one_view"
    rejected = client.post(
        "/app/v0/rpc/CreateNewProject",
        json={
            "projectKey": "one-view",
            "data_dir": str(one_view),
            "projectInfo": {"views": ["front"]},
        },
    )
    assert rejected.status_code == 400
    assert "at least two camera views" in rejected.json()["detail"]
    assert not one_view.exists()

    none = tmp_path / "no_views"
    created_none = client.post(
        "/app/v0/rpc/CreateNewProject",
        json={
            "projectKey": "no-views",
            "data_dir": str(none),
            "projectInfo": {"views": []},
        },
    )
    assert created_none.status_code == 200
    with open(none / "project.yaml") as f:
        assert yaml.safe_load(f)["view_names"] == []

    two = tmp_path / "two_views"
    created_two = client.post(
        "/app/v0/rpc/CreateNewProject",
        json={
            "projectKey": "two-views",
            "data_dir": str(two),
            "projectInfo": {"views": ["front", "side"]},
        },
    )
    assert created_two.status_code == 200
    with open(two / "project.yaml") as f:
        assert yaml.safe_load(f)["view_names"] == ["front", "side"]

    project_key = "existing"
    data_dir = register_project(project_key, views=["front", "side"])
    before = (data_dir / "project.yaml").read_text()
    updated = client.post(
        "/app/v0/rpc/UpdateProjectConfig",
        json={
            "projectKey": project_key,
            "projectInfo": {"views": ["front"]},
        },
    )
    assert updated.status_code == 400
    assert (data_dir / "project.yaml").read_text() == before

    cleared = client.post(
        "/app/v0/rpc/UpdateProjectConfig",
        json={
            "projectKey": project_key,
            "projectInfo": {"views": []},
        },
    )
    assert cleared.status_code == 200
    with open(data_dir / "project.yaml") as f:
        assert yaml.safe_load(f)["view_names"] == []


def test_create_rejects_underscore_view_and_update_allows_it(
    client: TestClient, register_project, tmp_path
):
    """A new project can't have _ in a view name; an existing one can still be saved."""
    data_dir = tmp_path / "underscore"
    rejected = client.post(
        "/app/v0/rpc/CreateNewProject",
        json={
            "projectKey": "underscore",
            "data_dir": str(data_dir),
            "projectInfo": {"views": ["cam_top", "cam-side"]},
        },
    )
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == (
        "View names can't contain _ (cam_top), because video and folder names are "
        "split at the last _. Use - instead (for example cam-top)."
    )
    assert not data_dir.exists()

    existing = register_project("existing", views=["front", "side"])
    updated = client.post(
        "/app/v0/rpc/UpdateProjectConfig",
        json={"projectKey": "existing", "projectInfo": {"views": ["cam_top", "side"]}},
    )
    assert updated.status_code == 200
    with open(existing / "project.yaml") as f:
        assert yaml.safe_load(f)["view_names"] == ["cam_top", "side"]
