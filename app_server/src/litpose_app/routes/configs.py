from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, status, Depends
from omegaconf import OmegaConf

from litpose_app import deps
from litpose_app.deps import ProjectInfoGetter

router = APIRouter()


@router.get("/app/v0/getYamlFile")
def get_yaml_file(
    file_path: Path = Query(..., alias="file_path"),
    projectKey: str = Query(..., alias="projectKey"),
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> dict:
    """Reads a YAML file using OmegaConf and returns it as a plain dict.

    Args:
        file_path: Relative path to the YAML file (relative to project
            data_dir)
    Returns:
        A JSON-serializable dict with the YAML contents.

    Raises:
        404 if the file is not found.
        400 if the file cannot be parsed as YAML.
    """
    # Normalize to absolute path within the container
    project = project_info_getter(projectKey)
    path = project.paths.data_dir / file_path
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {file_path}",
        )

    try:
        cfg = OmegaConf.load(path)
        cfg_dict = OmegaConf.to_container(cfg, resolve=True)  # convert to plain types
        assert isinstance(cfg_dict, dict)
        return cfg_dict  # FastAPI will serialize to JSON
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse YAML: {e}",
        )
