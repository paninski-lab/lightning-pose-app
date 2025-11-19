import typing as t
import pytest

from fastapi.testclient import TestClient
from litpose_app import deps
from lightning_pose.rootconfig import RootConfig


@pytest.fixture(scope="session", autouse=True)
def client() -> t.Iterator[TestClient]:
    """Synchronous TestClient bound to the real FastAPI app.

    We avoid importing the app until we've disabled FastAPI's multipart check,
    so tests don't require python-multipart to be installed.
    """
    # Disable FastAPI's import-time multipart dependency check
    import fastapi.dependencies.utils as fdu

    def _noop():
        return None

    fdu.ensure_multipart_is_installed = _noop  # type: ignore[attr-defined]

    # Now it's safe to import the app
    from litpose_app.main import app as _app

    # No lifespan
    yield TestClient(_app)


@pytest.fixture(scope="function", autouse=True)
def override_config(tmp_path) -> t.Iterator[RootConfig]:
    """Redirect Config.PROJECT_INFO_TOML_PATH to a temp file for IO isolation."""
    from litpose_app.main import app as _app

    _app.dependency_overrides[deps.root_config] = lambda: RootConfig(
        LP_SYSTEM_DIR=tmp_path / ".lightning-pose"
    )

    class _DummyConfig:
        PROJECT_INFO_TOML_PATH = tmp_path / ".lightning-pose" / "project_info.toml"

    _app.dependency_overrides[deps.config] = lambda: _DummyConfig()
    try:
        yield _app.dependency_overrides[deps.root_config]()
    finally:
        _app.dependency_overrides.pop(deps.config, None)
        _app.dependency_overrides.pop(deps.root_config, None)
