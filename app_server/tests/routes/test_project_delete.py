from __future__ import annotations

from pathlib import Path

import tomli
import tomli_w
from fastapi.testclient import TestClient


def test_delete_project_unregister_only(client: TestClient, register_project, tmp_path):
    """Test that deleting a project without removeFiles only unregisters it."""
    project_key = "test_project"
    data_dir = tmp_path / "data"
    model_dir = tmp_path / "models"
    data_dir.mkdir()
    model_dir.mkdir()

    # Register the project first
    register_project(project_key, data_dir)

    # Manually add model_dir to projects.toml for this test since fixture doesn't support it
    from litpose_app import deps

    # Get the config from dependency override
    from litpose_app.main import app
    config = app.dependency_overrides[deps.root_config]()
    projects_toml = config.PROJECTS_TOML_PATH

    with open(projects_toml, "rb") as f:
        projects = tomli.load(f)
    projects[project_key]["model_dir"] = str(model_dir)
    with open(projects_toml, "wb") as f:
        tomli_w.dump(projects, f)

    # Verify it exists in registry
    response = client.post("/app/v0/rpc/listProjects")
    assert response.status_code == 200
    projects = response.json()["projects"]
    assert any(p["project_key"] == project_key for p in projects)

    # Call deleteProject with removeFiles=False
    response = client.post(
        "/app/v0/rpc/deleteProject",
        json={"projectKey": project_key, "removeFiles": False}
    )
    assert response.status_code == 200

    # Verify it is removed from registry
    response = client.post("/app/v0/rpc/listProjects")
    projects = response.json()["projects"]
    assert not any(p["project_key"] == project_key for p in projects)

    # Verify files still exist
    assert data_dir.exists()
    assert model_dir.exists()

def test_delete_project_with_files(client: TestClient, register_project, tmp_path):
    """Test that deleting a project with removeFiles=True deletes files and unregisters."""
    project_key = "test_project_with_files"
    data_dir = tmp_path / "data_to_delete"
    model_dir = tmp_path / "models_to_delete"
    data_dir.mkdir()
    model_dir.mkdir()

    # Register the project
    register_project(project_key, data_dir)

    from litpose_app import deps
    from litpose_app.main import app
    config = app.dependency_overrides[deps.root_config]()
    projects_toml = config.PROJECTS_TOML_PATH

    with open(projects_toml, "rb") as f:
        projects = tomli.load(f)
    projects[project_key]["model_dir"] = str(model_dir)
    with open(projects_toml, "wb") as f:
        tomli_w.dump(projects, f)

    # Call deleteProject with removeFiles=True
    response = client.post(
        "/app/v0/rpc/deleteProject",
        json={
            "projectKey": project_key,
            "removeFiles": True,
            "confirmProjectKey": project_key,
        }
    )
    assert response.status_code == 200

    # Verify it is removed from registry
    response = client.post("/app/v0/rpc/listProjects")
    projects = response.json()["projects"]
    assert not any(p["project_key"] == project_key for p in projects)

    # Verify files are deleted
    assert not data_dir.exists()
    assert not model_dir.exists()

def test_delete_non_existent_project(client: TestClient):
    """Test deleting a project that doesn't exist returns 404."""
    response = client.post(
        "/app/v0/rpc/deleteProject",
        json={"projectKey": "non_existent", "removeFiles": False}
    )
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def _set_model_dir(projects_toml: Path, project_key: str, model_dir: Path) -> None:
    with open(projects_toml, "rb") as f:
        projects = tomli.load(f)
    projects[project_key]["model_dir"] = str(model_dir)
    with open(projects_toml, "wb") as f:
        tomli_w.dump(projects, f)


def _still_registered(client: TestClient, project_key: str) -> bool:
    response = client.post("/app/v0/rpc/listProjects")
    projects = response.json()["projects"]
    return any(p["project_key"] == project_key for p in projects)


def test_delete_project_files_requires_confirm_name(
    client: TestClient, register_project, tmp_path
):
    """Permanent delete without the typed project name leaves disk and registry alone."""
    project_key = "needs_confirm"
    data_dir = register_project(project_key, tmp_path / "needs_confirm")

    response = client.post(
        "/app/v0/rpc/deleteProject",
        json={"projectKey": project_key, "removeFiles": True},
    )
    assert response.status_code == 400
    assert "project name" in response.json()["detail"].lower()
    assert data_dir.exists()
    assert _still_registered(client, project_key)


def test_delete_project_files_wrong_confirm_name(
    client: TestClient, register_project, tmp_path
):
    project_key = "needs_exact_name"
    data_dir = register_project(project_key, tmp_path / "needs_exact_name")

    response = client.post(
        "/app/v0/rpc/deleteProject",
        json={
            "projectKey": project_key,
            "removeFiles": True,
            "confirmProjectKey": project_key.upper(),
        },
    )
    assert response.status_code == 400
    assert data_dir.exists()
    assert _still_registered(client, project_key)


def test_delete_project_files_without_project_yaml(
    client: TestClient, override_config, tmp_path
):
    """A directory with no project.yaml is not a project root and must not be removed."""
    project_key = "no_yaml"
    data_dir = tmp_path / "no_yaml"
    data_dir.mkdir()
    with open(override_config.PROJECTS_TOML_PATH, "wb") as f:
        tomli_w.dump({project_key: {"data_dir": str(data_dir)}}, f)

    response = client.post(
        "/app/v0/rpc/deleteProject",
        json={
            "projectKey": project_key,
            "removeFiles": True,
            "confirmProjectKey": project_key,
        },
    )
    assert response.status_code == 400
    assert "project.yaml" in response.json()["detail"]
    assert data_dir.exists()
    assert _still_registered(client, project_key)


def test_delete_project_model_dir_ancestor_rejected(
    client: TestClient, register_project, override_config, tmp_path
):
    project_key = "child_project"
    parent = tmp_path / "parent"
    data_dir = register_project(project_key, parent / "data")
    _set_model_dir(override_config.PROJECTS_TOML_PATH, project_key, parent)

    response = client.post(
        "/app/v0/rpc/deleteProject",
        json={
            "projectKey": project_key,
            "removeFiles": True,
            "confirmProjectKey": project_key,
        },
    )
    assert response.status_code == 400
    assert "data directory" in response.json()["detail"]
    assert data_dir.exists()
    assert parent.exists()
    assert _still_registered(client, project_key)


def test_delete_project_model_dir_contains_other_project(
    client: TestClient, register_project, override_config, tmp_path
):
    # The other project's model dir sits in the bucket, but its project.yaml does not,
    # so this fails the "contains another project" check rather than the yaml walk.
    bucket = tmp_path / "bucket"
    other_models = bucket / "other_models"
    other_models.mkdir(parents=True)
    other_data = register_project("other", tmp_path / "other_data")
    _set_model_dir(override_config.PROJECTS_TOML_PATH, "other", other_models)
    project_key = "owner"
    data_dir = register_project(project_key, tmp_path / "owner")
    _set_model_dir(override_config.PROJECTS_TOML_PATH, project_key, bucket)

    response = client.post(
        "/app/v0/rpc/deleteProject",
        json={
            "projectKey": project_key,
            "removeFiles": True,
            "confirmProjectKey": project_key,
        },
    )
    assert response.status_code == 400
    assert "another registered project" in response.json()["detail"]
    assert data_dir.exists()
    assert other_data.exists()
    assert _still_registered(client, project_key)
    assert _still_registered(client, "other")


def test_delete_project_model_dir_contains_nested_project_yaml(
    client: TestClient, register_project, override_config, tmp_path
):
    project_key = "external_models"
    data_dir = register_project(project_key, tmp_path / "external_models")
    model_dir = tmp_path / "loose_models"
    stray = model_dir / "stray"
    stray.mkdir(parents=True)
    (stray / "project.yaml").write_text("schema_version: 1\n")
    _set_model_dir(override_config.PROJECTS_TOML_PATH, project_key, model_dir)

    response = client.post(
        "/app/v0/rpc/deleteProject",
        json={
            "projectKey": project_key,
            "removeFiles": True,
            "confirmProjectKey": project_key,
        },
    )
    assert response.status_code == 400
    assert "project.yaml" in response.json()["detail"]
    assert data_dir.exists()
    assert (stray / "project.yaml").exists()
    assert _still_registered(client, project_key)


def test_register_existing_project_rejects_home(client: TestClient, monkeypatch, tmp_path):
    """Registering the home directory itself is refused before any files are written."""
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setattr(
        "litpose_app.project_deletion.Path.home",
        classmethod(lambda cls: home),
    )

    response = client.post(
        "/app/v0/rpc/RegisterExistingProject",
        json={"projectKey": "home_project", "data_dir": str(home)},
    )
    assert response.status_code == 400
    assert "protected" in response.json()["detail"]
    assert not (home / "project.yaml").exists()
