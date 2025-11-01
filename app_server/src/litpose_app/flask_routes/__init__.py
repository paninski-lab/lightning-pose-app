"""Undecorated business logic for Flask routes.

All functions here are plain Python with full type annotations. The actual
Flask routes in `flask_app.py` should be very thin and delegate to these
functions. No Blueprint usage by design.
"""
from __future__ import annotations

from .models import (
    LegacyProjectInfo,
    LegacyGetProjectInfoResponse,
    RGlobRequest,
    RGlobResponseEntry,
    RGlobResponse,
)
from .project import get_project_info
from .rglob import rglob as rglob_logic

__all__ = [
    # models
    "LegacyProjectInfo",
    "LegacyGetProjectInfoResponse",
    "RGlobRequest",
    "RGlobResponseEntry",
    "RGlobResponse",
    # functions
    "get_project_info",
    "rglob_logic",
]
