import logging

import pandas as pd
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from .project import ProjectInfo
from .. import deps
from ..tasks.extract_frames import (
    extract_frames_task,
    Session,
    MVLabelFile,
    RandomMethodOptions,
    LabelFileView,
)

logger = logging.getLogger(__name__)
router = APIRouter()
from litpose_app.config import Config


@router.post("/app/v0/rpc/getFineVideoDir")
def get_fine_video_dir(config: Config = Depends(deps.config)):
    return {"path": config.FINE_VIDEO_DIR}


class LabelFileCreationRequest(BaseModel):
    """
    Request to create label file
    if it does not exist.
    """

    labelFileTemplate: str
    """Multiview projects filenames should contain a
    star to represent view name."""


class ExtractFramesRequest(BaseModel):
    labelFileCreationRequest: LabelFileCreationRequest | None = None
    session: Session

    labelFile: MVLabelFile | None = None
    """
    Client sets None when labelFileCreationRequest is present.
    Internally it will be populated once the labelFileCreationRequest is processed.
    """

    method: str
    options: RandomMethodOptions  # add more types here with union types


@router.post("/app/v0/rpc/extractFrames")
async def extract_frames(
    request: ExtractFramesRequest,
    config: Config = Depends(deps.config),
    project_info: ProjectInfo = Depends(deps.project_info),
):

    def on_progress(x):
        logger.info(f"extractFrames progress: {x}")

    if request.labelFileCreationRequest is not None:
        assert request.labelFile is None
        mvlabelfile = await run_in_threadpool(
            init_label_file,
            request.labelFileCreationRequest,
            project_info,
        )
        request.labelFile = mvlabelfile

    await run_in_threadpool(
        extract_frames_task,
        config,
        request.session,
        project_info,
        request.labelFile,
        on_progress,
        request.method,
        request.options,
    )

    return "ok"


def init_label_file(
    labelFileCreationRequest: LabelFileCreationRequest,
    project_info: ProjectInfo,
) -> MVLabelFile:
    # Map of view to label file path
    files_to_create = []
    if "*" in labelFileCreationRequest.labelFileTemplate:
        assert project_info.views and len(project_info.views) > 0
        lfviews = []
        for view in project_info.views:
            files_to_create.append(
                project_info.data_dir
                / (
                    labelFileCreationRequest.labelFileTemplate.replace("*", view)
                    + ".csv"
                )
            )
            lfviews.append(LabelFileView(csvPath=files_to_create[-1], viewName=view))
        mvlabelfile = MVLabelFile(views=lfviews)

    else:
        files_to_create.append(
            project_info.data_dir
            / (labelFileCreationRequest.labelFileTemplate + ".csv")
        )
        mvlabelfile = MVLabelFile(
            views=[LabelFileView(csvPath=files_to_create[0], viewName="unknown")]
        )

    for p in files_to_create:
        if p.exists():
            with p.open("r") as file:
                line_count = 0
                for _ in file:
                    line_count += 1
                    if line_count >= 3:
                        raise ValueError(
                            f"Label file {p} already exists and is not empty. Stopping to prevent data loss."
                        )

    # Create the DataFrame (it's the same for all files)
    assert project_info.keypoint_names is not None
    assert len(project_info.keypoint_names) > 0
    column_levels = [["scorer"], project_info.keypoint_names, ["x", "y"]]
    column_names = ["scorer", "bodyparts", "coords"]
    column_index = pd.MultiIndex.from_product(column_levels, names=column_names)
    df = pd.DataFrame([], index=[], columns=column_index)

    # Create the label files
    for p in files_to_create:
        assert p.suffix == ".csv"
        df.to_csv(p)

    return mvlabelfile
