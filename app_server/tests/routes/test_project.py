"""
End-to-end leaning tests for project routes.

These tests exercise the real route logic with minimal dependency overrides.
We only redirect the config path to a temporary location so that file IO
does not touch user/system paths.
"""

from __future__ import annotations

import pytest
from pathlib import Path

import toml
import tomli_w
import yaml
from fastapi.testclient import TestClient
from litpose_app.rootconfig import RootConfig
from litpose_app.project import ProjectUtil
from litpose_app.datatypes import ProjectPaths


@pytest.fixture
def project_util(override_config: RootConfig) -> ProjectUtil:
    """Pytest fixture to create a ProjectUtil instance."""
    return ProjectUtil(config=override_config)


def test_project_model():
    # Case: model_dir omitted, direct constructor usage
    p = ProjectPaths(data_dir=Path("/test"))

    # Default applied
    assert p.model_dir == Path("/test/models")
    # Unset fields excluded
    assert "model_dir" not in p.model_fields_set
    out = p.model_dump(mode="json", exclude_unset=True)
    assert set(out.keys()) == set(["data_dir"])
    assert out["data_dir"] == "/test"

    # Case: model_dir omitted, model_validate usage
    p = ProjectPaths.model_validate({"data_dir": Path("/test")})

    # Default applied
    assert p.model_dir == Path("/test/models")
    # Unset fields excluded
    assert "model_dir" not in p.model_fields_set
    out = p.model_dump(mode="json", exclude_unset=True)
    assert set(out.keys()) == set(["data_dir"])
    assert out["data_dir"] == "/test"

    # Case: model_dir explicitly specified
    p = ProjectPaths.model_validate(dict(data_dir="/test", model_dir="/nottest"))

    # Default not applied
    assert p.model_dir == Path("/nottest")
    # model_dir included in serialization.
    assert "model_dir" in p.model_fields_set
    out = p.model_dump(mode="json", exclude_unset=True)
    assert set(out.keys()) == set(["data_dir", "model_dir"])
    assert out["data_dir"] == "/test"
    assert out["model_dir"] == "/nottest"


def test_get_all_project_paths(project_util: ProjectUtil):
    """Test retrieving all project paths from the TOML file."""
    # Setup: write some data to the toml file
    projects_data = {
        "proj1": {
            "data_dir": "/path/to/data1",
            "model_dir": "/path/to/models1",
        },
        "proj2": {
            "data_dir": "/path/to/data2",
        },
    }
    with open(project_util.config.PROJECTS_TOML_PATH, "wb") as f:
        tomli_w.dump(projects_data, f)

    # Action
    all_projects = project_util.get_all_project_paths()

    # Assert
    assert len(all_projects) == 2
    assert "proj1" in all_projects
    assert "proj2" in all_projects
    assert isinstance(all_projects["proj1"], ProjectPaths)
    assert all_projects["proj1"].data_dir == Path("/path/to/data1")
    assert all_projects["proj1"].model_dir == Path("/path/to/models1")
    assert isinstance(all_projects["proj2"], ProjectPaths)
    assert all_projects["proj2"].data_dir == Path("/path/to/data2")
    assert all_projects["proj2"].model_dir == Path("/path/to/data2/models")


def test_update_project_paths(project_util: ProjectUtil):
    """Test updating a project's paths in the TOML file."""
    # Setup
    proj_key = "proj_new"
    paths = ProjectPaths(data_dir=Path("/new/data"), model_dir=Path("/new/models"))

    # Action
    project_util.update_project_paths(proj_key, paths)

    # Assert
    all_projects = project_util.get_all_project_paths()
    assert len(all_projects) == 1
    assert proj_key in all_projects
    assert all_projects[proj_key].data_dir == Path("/new/data")
    assert all_projects[proj_key].model_dir == Path("/new/models")


def test_get_project_paths_for_model(project_util: ProjectUtil):
    """Test finding project paths for a given model directory."""
    # Setup: write some data to the toml file
    model_dir1 = Path("/path/to/models1/some_model")
    projects_data = {
        "proj1": {
            "data_dir": "/path/to/data1",
            "model_dir": "/path/to/models1",
        },
        "proj2": {
            "data_dir": "/path/to/data2",
            "model_dir": "/path/to/models2",
        },
    }
    with open(project_util.config.PROJECTS_TOML_PATH, "wb") as f:
        tomli_w.dump(projects_data, f)

    # Action
    project_paths = project_util.get_project_paths_for_model(model_dir=model_dir1)

    # Assert
    assert project_paths.data_dir == Path("/path/to/data1")

    # Test for model not in any project
    with pytest.raises(RuntimeError):
        project_util.get_project_paths_for_model(model_dir=Path("/not/a/project/model"))


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


def test_update_project_config_updates_paths_and_writes_yaml_to_new_dir(
    client: TestClient, override_config, tmp_path
):
    # setup the projects TOML file contents with initial path
    with open(override_config.PROJECTS_TOML_PATH, "wb") as f:
        old_data_dir = str(tmp_path / "old_project")
        tomli_w.dump({"demo-project": {"data_dir": old_data_dir}}, f)

    # create old dir and initial YAML
    Path(old_data_dir).mkdir(parents=True, exist_ok=True)
    with open(Path(old_data_dir) / "project.yaml", "w") as f:
        yaml.safe_dump({"view_names": ["camA"], "schema_version": 1}, f)

    # choose a new data dir and ensure it exists for writing
    new_data_dir = tmp_path / "moved_project"
    new_data_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "projectKey": "demo-project",
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
    assert data == {"demo-project": {"data_dir": str(new_data_dir)}}

    # Verify project.yaml written in new location, merged content retained
    with open(new_data_dir / "project.yaml", "r") as f:
        y = yaml.safe_load(f)
    assert y == {
        "schema_version": 1,
        "view_names": ["camA"],
        "keypoint_names": ["nose"],
    }
