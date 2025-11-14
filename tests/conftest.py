import typing as t
import pytest

from fastapi.testclient import TestClient
from litpose_app.main import app
from litpose_app import deps
from lightning_pose.rootconfig import RootConfig


@pytest.fixture(scope="session", autouse=True)
def client() -> t.Iterator[TestClient]:
    """Synchronous TestClient bound to the real FastAPI app."""
    """ Runs lifespan: 
    with TestClient(app) as c:
        yield c
        """
    # No lifespan
    yield TestClient(app)


@pytest.fixture(scope="function", autouse=True)
def override_config(tmp_path) -> t.Iterator[RootConfig]:
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
