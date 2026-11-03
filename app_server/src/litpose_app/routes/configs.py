"""RPC and REST endpoints for reading YAML config files (project configs and bundled defaults)."""

from __future__ import annotations

import importlib.resources
import json
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from omegaconf import OmegaConf
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.deps import ProjectInfoGetter
from litpose_app.utils.file_transaction import write_atomic

router = APIRouter()

# The project's base model config. The Create Model dialog merges its form on
# top of this file when it exists, and on top of LPA's bundled default when not.
PROJECT_DEFAULT_CONFIG = Path("configs") / "default.yaml"


def bundled_default_config_name(multiview: bool) -> str:
    """File name of LPA's bundled default config for a single-view or multiview project."""
    return "config_default_multiview.yaml" if multiview else "config_default.yaml"


def write_project_default_config(data_dir: Path, multiview: bool) -> Path:
    """Copy LPA's bundled default config to ``configs/default.yaml``.

    Never overwrites: raises FileExistsError when the file is already there.
    """
    dest = data_dir / PROJECT_DEFAULT_CONFIG
    if dest.exists():
        raise FileExistsError(dest)
    ref = importlib.resources.files("litpose_app") / bundled_default_config_name(multiview)
    content = ref.read_bytes()
    dest.parent.mkdir(parents=True, exist_ok=True)
    write_atomic(dest, lambda tmp: tmp.write_bytes(content))
    return dest


class WriteDefaultModelConfigRequest(BaseModel):
    """Create the project's configs/default.yaml from LPA's bundled default."""

    projectKey: str


class WriteDefaultModelConfigResponse(BaseModel):
    """Path of the written configs/default.yaml."""

    path: str


@router.post("/app/v0/rpc/writeDefaultModelConfig")
def write_default_model_config(
    request: WriteDefaultModelConfigRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> WriteDefaultModelConfigResponse:
    """Write LPA's default config (single-view or multiview) as the project's default.

    Returns 409 and changes nothing when configs/default.yaml already exists.
    """
    project = project_info_getter(request.projectKey)
    multiview = len(project.config.view_names or []) > 1
    try:
        dest = write_project_default_config(project.paths.data_dir, multiview)
    except FileExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{PROJECT_DEFAULT_CONFIG.as_posix()} already exists; it was not changed.",
        )
    return WriteDefaultModelConfigResponse(path=str(dest))


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


class RecommendModelConfigRequest(BaseModel):
    """A label file (its CSVs, one per view) to recommend training settings for."""

    projectKey: str
    csvPaths: list[str]
    viewNames: list[str] = []
    videosDir: str = "videos"
    topDownFreelyMoving: bool = False


_RECOMMEND_SCRIPT = Path(__file__).parent.parent / "scripts" / "recommend_config.py"
_RECOMMEND_TIMEOUT_S = 600


@router.post("/app/v0/rpc/recommendModelConfig")
def recommend_model_config(
    request: RecommendModelConfigRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> dict:
    """LP's recommended settings (``litpose recommend``) for the chosen label file.

    Runs ``scripts/recommend_config.py`` in a separate process and returns its
    JSON: ``recommendation`` (LP's ``ConfigRecommendation`` with a rationale per
    field), ``gpu``, ``labeledFrames``, ``imageHeight`` and ``imageWidth``.
    Returns 400 with LP's message when the recommender fails.
    """
    project = project_info_getter(request.projectKey)
    data_dir = project.paths.data_dir.resolve()
    csv_paths: list[Path] = []
    for raw in request.csvPaths:
        path = Path(raw)
        if not path.is_absolute():
            path = data_dir / path
        if not path.resolve().is_relative_to(data_dir):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{raw} is not inside the project's data directory.",
            )
        csv_paths.append(path)
    if not csv_paths:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a label file first."
        )
    video_dir = (data_dir / request.videosDir).resolve()
    if video_dir.parent != data_dir:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{request.videosDir} is not a folder in the data directory.",
        )

    cmd = [sys.executable, str(_RECOMMEND_SCRIPT), "--csv", *map(str, csv_paths)]
    if len(request.viewNames) > 1:
        cmd += ["--views", *request.viewNames]
    cmd += ["--video_dir", str(video_dir)]
    if request.topDownFreelyMoving:
        cmd.append("--top_down_freely_moving")
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=_RECOMMEND_TIMEOUT_S
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recommending settings took too long and was stopped.",
        )
    lines = proc.stdout.strip().splitlines()
    if proc.returncode != 0 or not lines:
        errors = [line for line in proc.stderr.strip().splitlines() if line.strip()]
        reason = errors[-1] if errors else f"exit code {proc.returncode}"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not recommend settings: {reason}",
        )
    return json.loads(lines[-1])


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
    """Load and parse a YAML file via OmegaConf, raising HTTP 404/400 on failure."""
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
