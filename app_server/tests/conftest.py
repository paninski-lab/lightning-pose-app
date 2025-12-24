import typing as t
import pytest

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
    """Redirect Config.PROJECT_INFO_TOML_PATH to a temp file for IO isolation."""
    from litpose_app.main import app as _app

    _app.dependency_overrides = {}
    _app.dependency_overrides[deps.root_config] = lambda: RootConfig(
        LP_SYSTEM_DIR=tmp_path / ".lightning-pose"
    )
    print(tmp_path)
    _PROJECT_INFO_TOML_PATH = tmp_path / ".lightning-pose" / "project.toml"
    _PROJECTS_TOML_PATH = tmp_path / ".lightning-pose" / "projects.toml"

    class _DummyConfig:
        PROJECT_INFO_TOML_PATH = _PROJECT_INFO_TOML_PATH

    _PROJECT_INFO_TOML_PATH.unlink(missing_ok=True)
    _PROJECTS_TOML_PATH.unlink(missing_ok=True)
    _app.dependency_overrides[deps.config] = lambda: _DummyConfig()
    try:

        yield _app.dependency_overrides[deps.root_config]()
    finally:
        _PROJECT_INFO_TOML_PATH.unlink(missing_ok=True)
        _PROJECTS_TOML_PATH.unlink(missing_ok=True)
        _app.dependency_overrides.pop(deps.config, None)
        _app.dependency_overrides.pop(deps.root_config, None)
