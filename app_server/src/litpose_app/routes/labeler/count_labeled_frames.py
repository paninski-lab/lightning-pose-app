"""RPC endpoint that counts the labeled frames in a label CSV."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.datatypes import Project
from litpose_app.deps import ProjectInfoGetter
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row

router = APIRouter()


class CountLabeledFramesRequest(BaseModel):
    """A label CSV inside the project's data directory."""

    projectKey: str
    csvPath: Path


class CountLabeledFramesResponse(BaseModel):
    """Number of frame rows LP will train on from the CSV."""

    labeledFrames: int


def count_label_csv_rows(csv_path: Path) -> int:
    """Count frame rows the way LP reads them (``lightning_pose/utils/io.py:parse_label_csv``).

    A row whose keypoints are all empty still counts; LP keeps it as a sample.
    """
    df = pd.read_csv(csv_path, header=[0, 1, 2], index_col=0)
    return len(fix_empty_first_row(df))


@router.post("/app/v0/rpc/countLabeledFrames")
def count_labeled_frames(
    request: CountLabeledFramesRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> CountLabeledFramesResponse:
    """Return the number of labeled frames in ``csvPath``.

    The model dialog uses this to tell whether there are enough frames for Pose PCA.
    """
    project: Project = project_info_getter(request.projectKey)
    data_dir = project.paths.data_dir.resolve()
    csv_path = request.csvPath
    if not csv_path.is_absolute():
        csv_path = data_dir / csv_path
    if not csv_path.resolve().is_relative_to(data_dir):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{request.csvPath} is not inside the project's data directory.",
        )
    return CountLabeledFramesResponse(labeledFrames=count_label_csv_rows(csv_path))
