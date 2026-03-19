import typing as t
from pathlib import Path
import pytest
import tomli_w
import yaml

from fastapi.testclient import TestClient
from litpose_app import deps
from litpose_app.rootconfig import RootConfig


@pytest.fixture()
def client(override_config) -> t.Iterator[TestClient]:
    """Synchronous TestClient bound to the real FastAPI app."""
    from litpose_app.main import app as _app

    # No lifespan
    yield TestClient(_app)


@pytest.fixture(scope="function", autouse=True)
def override_config(tmp_path) -> t.Iterator[RootConfig]:
    """Redirect Config paths to a temp file for IO isolation."""
    from litpose_app.main import app as _app

    lp_system_dir = tmp_path / ".lightning-pose"
    lp_system_dir.mkdir(parents=True, exist_ok=True)

    # Instantiate config - this will trigger directory creation in RootConfig's validator
    config = RootConfig(LP_SYSTEM_DIR=lp_system_dir)

    _app.dependency_overrides = {}
    _app.dependency_overrides[deps.root_config] = lambda: config

    try:
        yield config
    finally:
        _app.dependency_overrides.pop(deps.config, None)
        _app.dependency_overrides.pop(deps.root_config, None)


@pytest.fixture
def register_project(override_config: RootConfig, tmp_path):
    """Fixture to register a project in the temporary projects.toml."""

    def _register(
        project_key: str,
        data_dir: Path | None = None,
        views: list[str] | None = None,
        keypoints: list[str] | None = None,
    ) -> Path:
        if data_dir is None:
            data_dir = tmp_path / project_key / "data"

        data_dir.mkdir(parents=True, exist_ok=True)

        # Create project.yaml
        config_data = {
            "view_names": views or ["camA", "camB"],
            "keypoint_names": keypoints or ["nose", "tail"],
        }
        with open(data_dir / "project.yaml", "w") as f:
            yaml.safe_dump(config_data, f)

        # Update projects.toml
        projects_toml_path = override_config.PROJECTS_TOML_PATH
        if projects_toml_path.exists():
            import tomli

            with open(projects_toml_path, "rb") as f:
                projects = tomli.load(f)
        else:
            projects = {}

        projects[project_key] = {"data_dir": str(data_dir)}
        with open(projects_toml_path, "wb") as f:
            tomli_w.dump(projects, f)

        return data_dir

    return _register
