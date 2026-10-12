"""RPC endpoint for discovering valid label CSV files within a project's data directory."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.datatypes import Project
from litpose_app.deps import ProjectInfoGetter
from litpose_app.routes.validate_files import _validate_labels

router = APIRouter()


class FindLabelFilesRequest(BaseModel):
    """Request to find all valid label CSV files in a project's data directory."""

    projectKey: str


@router.post("/app/v0/rpc/findLabelFiles")
def find_label_files(
    request: FindLabelFilesRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> dict:
    """Return label CSVs the File Manager would not mark Invalid.

    That includes a keypoint-mismatch warning. A bad name, a bad header, or a
    missing frame image is omitted. The search is recursive and skips the model
    directory and ``data_dir/models``. A pandas suffix on the scorer is ignored
    by the shared header check.
    """
    project: Project = project_info_getter(request.projectKey)
    label_files = [
        item.path for item in _validate_labels(project) if not item.issues
    ]
    return {"labelFiles": label_files}
