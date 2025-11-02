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
    GetYamlFileQuery,
    FFProbeRequest,
    FFProbeResponse,
)
from .project import get_project_info
from .rglob import rglob as rglob_logic
from .configs import load_yaml_relative
from .ffprobe import ffprobe_logic
from .labeler_write_multifile import write_multifile_logic
from .labeler_find_label_files import find_label_files_logic
from .labeler_save_mvframe import save_mvframe_logic
from .labeler_multiview_autolabel import get_mv_auto_labels_logic
from .labeler_bundle_adjust import bundle_adjust_logic
from .extract_frames import extract_frames_logic
from .model_endpoints import create_train_task_logic, list_models_logic

__all__ = [
    # models
    "LegacyProjectInfo",
    "LegacyGetProjectInfoResponse",
    "RGlobRequest",
    "RGlobResponseEntry",
    "RGlobResponse",
    "GetYamlFileQuery",
    "FFProbeRequest",
    "FFProbeResponse",
    # functions
    "get_project_info",
    "rglob_logic",
    "load_yaml_relative",
    "ffprobe_logic",
    "write_multifile_logic",
    "find_label_files_logic",
    "save_mvframe_logic",
    "get_mv_auto_labels_logic",
    "bundle_adjust_logic",
    "extract_frames_logic",
    "create_train_task_logic",
    "list_models_logic",
]
