import json
import logging
from typing import Literal, Optional

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
    pid: Optional[int] = None


class CreateTrainTaskRequest(BaseModel):
    modelName: str = Field(..., min_length=1)
    # YAML as string, but we store it verbatim; client may send object -> we will stringify if needed
    configYaml: str


class CreateTrainTaskResponse(BaseModel):
    ok: bool


class ModelInfo(BaseModel):
    id: str
    name: str
    status: Optional[StatusLiteral] = None


class ListModelsResponse(BaseModel):
    models: list[ModelInfo]


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

    model_dir = (project_info.model_dir / request.modelName).resolve()

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
    models: list[ModelInfo] = []
    if project_info is None or project_info.model_dir is None:
        return ListModelsResponse(models=models)

    base = project_info.model_dir
    if not base.exists():
        return ListModelsResponse(models=models)

    for child in sorted([p for p in base.iterdir() if p.is_dir()]):
        status_path = child / "train_status.json"
        status: Optional[StatusLiteral] = None
        if status_path.is_file():
            try:
                data = json.loads(status_path.read_text())
                status = data.get("status")
            except Exception:
                logger.exception("Failed to read train_status.json for %s", child)
        models.append(
            ModelInfo(
                id=child.name,
                name=child.name,
                status=status,
            )
        )
    return ListModelsResponse(models=models)
