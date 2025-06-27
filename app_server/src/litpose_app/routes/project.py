from pathlib import Path

import tomli
import tomli_w
from pydantic import BaseModel, ValidationError

from litpose_app.config import PROJECT_INFO_TOML_PATH
from fastapi import APIRouter

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
def get_project_info() -> GetProjectInfoResponse:
    try:
        # Open the file in binary read mode, as recommended by tomli
        with open(PROJECT_INFO_TOML_PATH, "rb") as f:
            # Load the TOML data into a Python dictionary
            toml_data = tomli.load(f)

        # Unpack the dictionary into the Pydantic model
        # Pydantic will handle all the validation from here.
        obj = ProjectInfo(**toml_data)
        return GetProjectInfoResponse(projectInfo=obj)

    except FileNotFoundError:
        return GetProjectInfoResponse(projectInfo=None)
    except tomli.TOMLDecodeError as e:
        print(f"Error: Could not decode the TOML file. Invalid syntax: {e}")
        raise
    except ValidationError as e:
        # Pydantic's validation error is very informative
        print(f"Error: Configuration is invalid. {e}")
        raise


@router.post("/app/v0/rpc/setProjectInfo")
def set_project_info(request: SetProjectInfoRequest) -> None:
    try:
        PROJECT_INFO_TOML_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Convert the Pydantic model to a dictionary for TOML serialization.
        # Use mode=json to make the resulting dict json-serializable (and thus
        # also toml serializable)
        project_data_dict = request.projectInfo.model_dump(
            mode="json", exclude_none=True
        )
        try:
            with open(PROJECT_INFO_TOML_PATH, "rb") as f:
                existing_project_data = tomli.load(f)
        except FileNotFoundError:
            existing_project_data = {}

        # Apply changes onto existing data, i.e. PATCH semantics.
        existing_project_data.update(project_data_dict)

        # Open the file in binary write mode to write the TOML data
        with open(PROJECT_INFO_TOML_PATH, "wb") as f:
            tomli_w.dump(existing_project_data, f)

        return None

    except IOError as e:
        # This catches errors related to file operations (e.g., permissions, disk full)
        error_message = f"Failed to write project information to file: {str(e)}"
        print(error_message)  # Log server-side
        raise e
    except Exception as e:  # Catch any other unexpected errors
        error_message = (
            f"An unexpected error occurred while saving project info: {str(e)}"
        )
        print(error_message)  # Log server-side
        raise e
