from __future__ import annotations
import os
import shutil
import tomli
import tomli_w
from pathlib import Path
from fastapi.testclient import TestClient
from litpose_app.datatypes import ProjectPaths

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
    from litpose_app.rootconfig import RootConfig
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
        json={"projectKey": project_key, "removeFiles": True}
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
