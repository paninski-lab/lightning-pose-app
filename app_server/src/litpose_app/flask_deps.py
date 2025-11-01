"""
Dependencies that can be injected into routes.
This has the benefit of making tests easier to write, as you can override dependencies.
See FastAPI Dependency Injection docs: https://fastapi.tiangolo.com/tutorial/dependencies/
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING


from litpose_app.config import Config
from flask_app import app

logger = logging.getLogger(__name__)


def config() -> Config:
    """Dependency that provides the app config object."""

    if not hasattr(app, "config"):
        app.config = Config()
    return app.config


if TYPE_CHECKING:
    from .routes.project import ProjectInfo


def project_info(config: Config = Depends(config)) -> ProjectInfo:
    import tomli
    from .routes.project import ProjectInfo

    from pydantic import ValidationError

    try:
        # Open the file in binary read mode, as recommended by tomli
        with open(config.PROJECT_INFO_TOML_PATH, "rb") as f:
            # Load the TOML data into a Python dictionary
            toml_data = tomli.load(f)

        # Unpack the dictionary into the Pydantic model
        return ProjectInfo.model_validate(toml_data)
    except FileNotFoundError:
        raise RuntimeError("project not yet setup, but project_info dep requested")
    except tomli.TOMLDecodeError as e:
        logger.error(f"Could not decode pyproject.toml. Invalid syntax: {e}")
        raise
    except ValidationError as e:
        logger.error(f"pyproject.toml is invalid. {e}")
        raise
