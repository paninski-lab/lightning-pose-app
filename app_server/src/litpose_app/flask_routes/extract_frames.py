from __future__ import annotations

import logging
from typing import Callable

import pandas as pd

from litpose_app.config import Config
from .models import (
    ExtractFramesRequest,
)
from .project import get_project_info
from litpose_app.tasks.extract_frames import (
    extract_frames_task,
    MVLabelFile,
    LabelFileView,
)

logger = logging.getLogger(__name__)


def extract_frames_logic(request: ExtractFramesRequest, config: Config) -> dict:
    """Synchronous wrapper around the extract frames task.

    Mirrors the FastAPI endpoint semantics:
      - Optionally create empty label CSV files when `labelFileCreationRequest` is provided.
      - Invoke the CPU/IO heavy task synchronously (blocking HTTP request) with a progress logger.
      - Return a simple OK payload on success.
    """
    project_info = get_project_info(config).projectInfo

    def on_progress(x: str):
        logger.info(f"extractFrames progress: {x}")

    # If we need to initialize label files, do it synchronously here.
    if request.labelFileCreationRequest is not None:
        assert request.labelFile is None
        mvlabelfile = init_label_file(request.labelFileCreationRequest.labelFileTemplate, project_info)
        request.labelFile = mvlabelfile

    # At this point, request.labelFile must be present
    if request.labelFile is None:
        raise ValueError("labelFile must be provided when labelFileCreationRequest is not present")

    # Needed for the FastAPI to flask migration:
    # Convert all paths in `request.session` to absolute paths by prepending with `project_info.data_dir`.
    for v in request.session.views:
        v.videoPath = project_info.data_dir / v.videoPath
    for v in request.labelFile.views:
        v.csvPath = project_info.data_dir / v.csvPath

    # Execute the task synchronously
    extract_frames_task(
        config,
        request.session,
        project_info,  # duck-typed LegacyProjectInfo with required fields
        request.labelFile,
        on_progress,
        request.method,
        request.options,
    )

    return {"ok": True}


def init_label_file(label_file_template: str, project_info) -> MVLabelFile:
    """Create one or multiple empty CSV label files and return an MVLabelFile.

    The template follows the FastAPI version: if it contains a '*', one file per
    view is created with the '*' replaced by the view name; otherwise a single
    label file is created with viewName 'unknown'.
    """
    files_to_create: list
    if "*" in label_file_template:
        assert project_info.views and len(project_info.views) > 0
        lfviews: list[LabelFileView] = []
        files_to_create = []
        for view in project_info.views:
            p = project_info.data_dir / (label_file_template.replace("*", view) + ".csv")
            files_to_create.append(p)
            lfviews.append(LabelFileView(csvPath=p, viewName=view))
        mvlabelfile = MVLabelFile(views=lfviews)
    else:
        p = project_info.data_dir / (label_file_template + ".csv")
        files_to_create = [p]
        mvlabelfile = MVLabelFile(views=[LabelFileView(csvPath=p, viewName="unknown")])

    # Guard against overwriting non-empty files
    for p in files_to_create:
        if p.exists():
            with p.open("r") as f:
                for i, _ in enumerate(f, start=1):
                    if i >= 3:
                        raise ValueError(
                            f"Label file {p} already exists and is not empty. Stopping to prevent data loss."
                        )

    # Create the DataFrame with MultiIndex columns
    assert project_info.keypoint_names is not None
    assert len(project_info.keypoint_names) > 0
    column_levels = [["scorer"], project_info.keypoint_names, ["x", "y"]]
    column_names = ["scorer", "bodyparts", "coords"]
    column_index = pd.MultiIndex.from_product(column_levels, names=column_names)
    df = pd.DataFrame([], index=[], columns=column_index)

    # Write CSVs
    for p in files_to_create:
        assert p.suffix == ".csv"
        p.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(p)

    return mvlabelfile
