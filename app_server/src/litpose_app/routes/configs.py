import importlib.resources
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
    return _load_yaml_file(path, display_name=str(file_path))


@router.get("/app/v0/configs/default")
def get_default_config() -> dict:
    """Returns the source config_default.yaml included in the application."""
    ref = importlib.resources.files("litpose_app") / "config_default.yaml"
    with importlib.resources.as_file(ref) as path:
        return _load_yaml_file(path)


@router.get("/app/v0/configs/default_multiview")
def get_default_multiview_config() -> dict:
    """Returns the source config_default_multiview.yaml included in the application."""
    ref = importlib.resources.files("litpose_app") / "config_default_multiview.yaml"
    with importlib.resources.as_file(ref) as path:
        return _load_yaml_file(path)


def _load_yaml_file(path: Path, display_name: str | None = None) -> dict:
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {display_name or path}",
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
