"""RPC endpoint for discovering valid label CSV files within a project's data directory."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.config import Config
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
    config: Config = Depends(deps.config),
) -> dict:
    """Return label CSVs the File Manager would not mark Invalid.

    A warning is included: a missing frame, an unusual index path, a keypoint
    mismatch, or a bodypart that lacks x or y while another bodypart has both.
    A header that is not a usable label table is omitted. The search follows
    ``Config.LABEL_CSV_SCOPE`` and skips the model directory and ``data_dir/models``.
    A pandas suffix on the scorer is ignored by the shared header check.
    """
    project: Project = project_info_getter(request.projectKey)
    items, _records = _validate_labels(
        project, config.LABEL_CSV_SCOPE, remember=False
    )
    label_files = [item.path for item in items if not item.issues]
    return {"labelFiles": label_files}
