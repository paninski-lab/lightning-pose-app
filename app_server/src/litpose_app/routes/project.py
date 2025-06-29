import logging
from pathlib import Path

import tomli
import tomli_w
from fastapi import APIRouter, Depends
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
    request: SetProjectInfoRequest, config: Config = Depends(deps.config)
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

        existing_project_data.update(project_data_dict)

        with open(config.PROJECT_INFO_TOML_PATH, "wb") as f:
            tomli_w.dump(existing_project_data, f)

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
