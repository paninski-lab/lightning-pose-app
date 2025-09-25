import logging
from pathlib import Path

import tomli
import tomli_w
from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.config import Config

logger = logging.getLogger(__name__)

router = APIRouter()


class ProjectInfo(BaseModel):
    """Class to hold information about the project"""

    data_dir: Path | None = None
    model_dir: Path | None = None
    views: list[str] | None = None
    keypoint_names: list[str] | None = None


class GetProjectInfoResponse(BaseModel):
    projectInfo: ProjectInfo | None  # None if project info not yet initialized


class SetProjectInfoRequest(BaseModel):
    projectInfo: ProjectInfo


@router.post("/app/v0/rpc/getProjectInfo")
def get_project_info(
    project_info: ProjectInfo = Depends(deps.project_info),
) -> GetProjectInfoResponse:
    return GetProjectInfoResponse(projectInfo=project_info)


@router.post("/app/v0/rpc/setProjectInfo")
def set_project_info(
    request: SetProjectInfoRequest,
    background_tasks: BackgroundTasks,
    config: Config = Depends(deps.config),
) -> None:
    try:
        config.PROJECT_INFO_TOML_PATH.parent.mkdir(parents=True, exist_ok=True)

        project_data_dict = request.projectInfo.model_dump(
            mode="json", exclude_none=True
        )
        try:
            with open(config.PROJECT_INFO_TOML_PATH, "rb") as f:
                existing_project_data = tomli.load(f)
        except FileNotFoundError:
            existing_project_data = {}

        # Determine if data_dir changed
        old_data_dir = existing_project_data.get("data_dir")
        new_data_dir = project_data_dict.get("data_dir")

        # Merge and persist
        existing_project_data.update(project_data_dict)
        with open(config.PROJECT_INFO_TOML_PATH, "wb") as f:
            tomli_w.dump(existing_project_data, f)

        # If data_dir changed (including being set for the first time), enqueue in background
        try:
            from litpose_app.utils.enqueue import enqueue_all_new_fine_videos_task

            if new_data_dir is not None and new_data_dir != old_data_dir:
                if background_tasks is not None:
                    background_tasks.add_task(enqueue_all_new_fine_videos_task)
                else:
                    # Fallback: schedule fire-and-forget if BackgroundTasks not provided
                    import asyncio

                    asyncio.create_task(enqueue_all_new_fine_videos_task())
        except Exception:
            # Log and continue; saving project info should not fail due to enqueue trigger
            logger.exception("Failed to schedule enqueue task after data_dir change.")

        return None

    except IOError as e:
        error_message = f"Failed to write project information to file: {str(e)}"
        print(error_message)
        raise e
    except Exception as e:
        error_message = (
            f"An unexpected error occurred while saving project info: {str(e)}"
        )
        print(error_message)
        raise e
