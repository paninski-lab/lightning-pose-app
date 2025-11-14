"""
End-to-end leaning tests for project routes.

These tests exercise the real route logic with minimal dependency overrides.
We only redirect the config path to a temporary location so that file IO
does not touch user/system paths.
"""

from __future__ import annotations

import typing as t
from pathlib import Path

import tomli
import tomli_w
import pytest
import yaml
from fastapi.testclient import TestClient
from lightning_pose.rootconfig import RootConfig

from litpose_app.main import app
from litpose_app import deps


@pytest.fixture(scope="module")
def client() -> t.Iterator[TestClient]:
    """Synchronous TestClient bound to the real FastAPI app.

    Note: This will run the app's lifespan events.
    """
    with TestClient(app) as c:
        yield c


@pytest.fixture
def override_config(tmp_path) -> RootConfig:
    """Redirect Config.PROJECT_INFO_TOML_PATH to a temp file for IO isolation."""

    app.dependency_overrides[deps.root_config] = lambda: RootConfig(
        LP_SYSTEM_DIR=tmp_path / ".lightning-pose"
    )

    class _DummyConfig:
        PROJECT_INFO_TOML_PATH = tmp_path / ".lightning-pose" / "project_info.toml"

    app.dependency_overrides[deps.config] = lambda: _DummyConfig()
    try:
        yield app.dependency_overrides[deps.root_config]()
    finally:
        app.dependency_overrides.pop(deps.config, None)
        app.dependency_overrides.pop(deps.root_config, None)


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


def test_set_project_info_creates_file(client: TestClient, override_config, tmp_path):
    """Posting project info should create the YAML file with provided fields."""
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
        "schema_version": 0,
        "view_names": ["camA", "camB"],
        "keypoint_names": ["nose", "ear_left"],
    }


"""If a file exists, new data should merge into it (overwriting overlaps).
def test_set_project_info_merges_existing(client: TestClient, override_config):
    # Prime existing file with some content, including an extra key to ensure it survives
    project_info_toml = override_config.PROJECT_INFO_TOML_PATH
    project_info_toml.parent.mkdir(parents=True, exist_ok=True)
    existing = {"views": ["oldCam"], "extra": 123}
    with open(project_info_toml, "wb") as f:
        tomli_w.dump(existing, f)

    # New payload updates views and adds keypoint_names
    payload = {
        "projectKey": "demo-project",
        "projectInfo": {
            "views": ["camX"],
            "keypoint_names": ["nose"],
        },
        "delete": False,
    }
    resp = client.post("/app/v0/rpc/setProjectInfo", json=payload)
    assert resp.status_code == 200
    assert resp.json() is None

    with open(project_info_toml, "rb") as f:
        data = tomli.load(f)

    # Expect merge: views overwritten, keypoint_names added, extra preserved
    assert data == {
        "views": ["camX"],
        "keypoint_names": ["nose"],
        "extra": 123,
    }
"""
