import asyncio
import json
import logging
from datetime import datetime
from typing import Literal
from pathlib import Path

import yaml

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from litpose_app import deps
from litpose_app.routes.project import ProjectInfo

logger = logging.getLogger(__name__)

router = APIRouter()


StatusLiteral = Literal[
    "PENDING",
    "STARTING",
    "STARTED",
    "TRAINING",
    "EVALUATING",
    "COMPLETED",
    "FAILED",
    "CANCELED",
    "PAUSED",
]


class TrainStatus(BaseModel):
    status: StatusLiteral
    pid: int | None = None


class CreateTrainTaskRequest(BaseModel):
    modelName: str = Field(..., min_length=1)
    # YAML as string, but we store it verbatim; client may send object -> we will stringify if needed
    configYaml: str


class CreateTrainTaskResponse(BaseModel):
    ok: bool


class ModelListResponseEntry(BaseModel):
    model_name: str
    model_relative_path: str
    config: dict | None
    created_at: str  # ISO format
    status: TrainStatus | None = None


class ListModelsResponse(BaseModel):
    models: list[ModelListResponseEntry]


@router.post("/app/v0/rpc/createTrainTask")
def create_train_task(
    request: CreateTrainTaskRequest,
    project_info: ProjectInfo = Depends(deps.project_info),
) -> CreateTrainTaskResponse:
    if project_info is None or project_info.model_dir is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project model_dir is not configured.",
        )

    model_dir = Path(project_info.model_dir / request.modelName).resolve()

    # Ensure model name maps within model_dir
    try:
        model_dir.relative_to(project_info.model_dir)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid model name.",
        )

    if model_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Model already exists.",
        )

    model_dir.mkdir(parents=True, exist_ok=False)

    # Save config.yaml
    (model_dir / "config.yaml").write_text(request.configYaml)

    # Create initial train_status.json
    status_path = model_dir / "train_status.json"
    status_json = TrainStatus(status="PENDING").model_dump()
    status_path.write_text(json.dumps(status_json, indent=2))

    # Prepare stdout/stderr files for future training
    (model_dir / "train_stdout.log").touch(exist_ok=True)
    (model_dir / "train_stderr.log").touch(exist_ok=True)

    return CreateTrainTaskResponse(ok=True)


@router.post("/app/v0/rpc/listModels")
def list_models(
    project_info: ProjectInfo = Depends(deps.project_info),
) -> ListModelsResponse:
    models: list[ModelListResponseEntry] = []
    if project_info is None or project_info.model_dir is None:
        return ListModelsResponse(models=models)

    base = Path(project_info.model_dir)
    if not base.exists():
        return ListModelsResponse(models=models)

    def read_model_config(child_path: Path) -> ModelListResponseEntry:
        config_path = child_path / "config.yaml"
        status_path = child_path / "train_status.json"
        config = None
        status = None

        if config_path.is_file():
            try:
                content = config_path.read_text()
                config = yaml.safe_load(content)
            except Exception:
                logger.exception("Failed to read config.yaml for %s", child_path)

        if status_path.is_file():
            try:
                content = status_path.read_text()
                status_data = json.loads(content)
                status = TrainStatus(**status_data)
            except Exception:
                logger.exception("Failed to read train_status.json for %s", child_path)

        stat = child_path.stat()
        created_at = datetime.fromtimestamp(stat.st_ctime).isoformat()

        return ModelListResponseEntry(
            model_name=child_path.name,
            model_relative_path=str(child_path.relative_to(base)),
            config=config,
            created_at=created_at,
            status=status,
        )

    paths = sorted([p for p in base.iterdir() if p.is_dir()])
    models = [read_model_config(p) for p in paths]

    return ListModelsResponse(models=models)
