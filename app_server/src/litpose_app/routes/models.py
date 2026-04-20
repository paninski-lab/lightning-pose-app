import asyncio
import json
import logging
import shutil
import time
from datetime import datetime
from typing import Iterator, Literal
from pathlib import Path
import os

import yaml

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from litpose_app import deps
from litpose_app.deps import ProjectInfoGetter
from litpose_app.datatypes import Project

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


class DetailedTrainStatus(BaseModel):
    completed: int | None = None
    total: int | None = None


class TrainStatus(BaseModel):
    status: StatusLiteral
    pid: int | None = None
    progress: DetailedTrainStatus | None = None


class CreateTrainTaskRequest(BaseModel):
    projectKey: str
    modelName: str = Field(..., min_length=1)
    # YAML as string, but we store it verbatim; client may send object -> we will stringify if needed
    configYaml: str


class CreateTrainTaskResponse(BaseModel):
    ok: bool


class ModelListResponseEntry(BaseModel):
    model_name: str
    model_relative_path: str
    model_kind: Literal['normal', 'eks'] = 'normal'
    config: dict | None
    ensemble_config: dict | None = None
    status: TrainStatus | None = None


class ListModelsResponse(BaseModel):
    models: list[ModelListResponseEntry]


class DeleteModelRequest(BaseModel):
    projectKey: str
    modelRelativePath: str


class RenameModelRequest(BaseModel):
    projectKey: str
    modelRelativePath: str
    newModelName: str


@router.post("/app/v0/rpc/createTrainTask")
def create_train_task(
    request: CreateTrainTaskRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> CreateTrainTaskResponse:
    project: Project = project_info_getter(request.projectKey)
    if project.paths.model_dir is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project model_dir is not configured.",
        )

    model_dir = Path(project.paths.model_dir / request.modelName).resolve()

    # Ensure model name maps within model_dir
    try:
        model_dir.relative_to(project.paths.model_dir)
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


class ListModelsRequest(BaseModel):
    projectKey: str


@router.post("/app/v0/rpc/listModels")
def list_models(
    request: ListModelsRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> ListModelsResponse:
    models: list[ModelListResponseEntry] = []
    project: Project = project_info_getter(request.projectKey)
    if project.paths.model_dir is None:
        return ListModelsResponse(models=models)

    model_dir = Path(project.paths.model_dir)
    models = read_models_l1_from_base(model_dir, model_dir)
    for m in models:
        if m.config is None and m.model_kind != 'eks':
            models.extend(
                read_models_l1_from_base(model_dir, model_dir / m.model_relative_path)
            )

    models = [m for m in models if m.config is not None or m.model_kind == 'eks']

    return ListModelsResponse(models=models)


def read_models_l1_from_base(
    model_dir: Path, iter_base: Path
) -> list[ModelListResponseEntry]:
    if not iter_base.exists():
        return []

    def read_model_config(child_path: Path) -> ModelListResponseEntry:
        ensemble_path = child_path / "ensemble.yaml"
        config_path = child_path / "config.yaml"
        status_path = child_path / "train_status.json"
        config = None
        ensemble_config = None
        model_kind: Literal['normal', 'eks'] = 'normal'
        status = None

        if ensemble_path.is_file():
            model_kind = 'eks'
            try:
                content = ensemble_path.read_text()
                ensemble_config = yaml.safe_load(content)
            except Exception:
                logger.exception("Failed to read ensemble.yaml for %s", child_path)
        elif config_path.is_file():
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

        return ModelListResponseEntry(
            model_name=child_path.name,
            model_relative_path=str(child_path.relative_to(model_dir)),
            model_kind=model_kind,
            config=config,
            ensemble_config=ensemble_config,
            status=status,
        )

    paths = sorted([p for p in iter_base.iterdir() if p.is_dir()])
    models = [read_model_config(p) for p in paths]

    return models


@router.post("/app/v0/rpc/deleteModel")
def delete_model(
    request: DeleteModelRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> None:
    project: Project = project_info_getter(request.projectKey)
    model_dir = project.paths.model_dir / request.modelRelativePath

    assert os.path.normpath(model_dir).startswith(
        os.path.normpath(project.paths.model_dir)
    )

    shutil.rmtree(model_dir)


class EnsembleMember(BaseModel):
    id: str


class CreateEksModelRequest(BaseModel):
    projectKey: str
    modelName: str = Field(..., min_length=1)
    members: list[EnsembleMember]
    view_names: list[str]
    smooth_param: float = 1000.0
    quantile_keep_pca: float = 50.0


class CreateEksModelResponse(BaseModel):
    ok: bool


@router.post("/app/v0/rpc/createEksModel")
def create_eks_model(
    request: CreateEksModelRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> CreateEksModelResponse:
    project: Project = project_info_getter(request.projectKey)
    if project.paths.model_dir is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project model_dir is not configured.",
        )

    model_dir = Path(project.paths.model_dir / request.modelName).resolve()

    try:
        model_dir.relative_to(project.paths.model_dir)
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

    ensemble_data = {
        "members": [{"id": m.id} for m in request.members],
        "view_names": request.view_names,
        "smooth_param": request.smooth_param,
        "quantile_keep_pca": request.quantile_keep_pca,
        "creation_datetime": datetime.now().isoformat(),
    }
    (model_dir / "ensemble.yaml").write_text(yaml.dump(ensemble_data, default_flow_style=False))

    return CreateEksModelResponse(ok=True)


@router.post("/app/v0/rpc/renameModel")
def rename_model(
    request: RenameModelRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> None:
    project: Project = project_info_getter(request.projectKey)
    model_dir = project.paths.model_dir / request.modelRelativePath

    assert os.path.normpath(model_dir).startswith(
        os.path.normpath(project.paths.model_dir)
    )
    shutil.move(model_dir, project.paths.model_dir / request.newModelName)


_TRAIN_TERMINAL = {"COMPLETED", "FAILED", "CANCELED"}


def _tail_log_file(path: Path, offset: int) -> tuple[list[str], int]:
    """Read new bytes from a log file starting at byte offset. Returns (lines, new_offset)."""
    try:
        with open(path, "rb") as f:
            f.seek(offset)
            chunk = f.read()
        new_offset = offset + len(chunk)
        lines = [l for l in chunk.decode("utf-8", errors="replace").splitlines() if l]
        return lines, new_offset
    except FileNotFoundError:
        return [], offset


def _stream_sse_sync(gen: Iterator[dict]):
    for payload in gen:
        data = json.dumps(payload)
        yield f"data: {data}\n\n"


@router.get("/app/v0/rpc/models/{projectKey}/{modelRelativePath:path}/stream")
def stream_train_task(
    projectKey: str,
    modelRelativePath: str,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
):
    """Stream training logs and status updates via SSE for a given model."""
    project: Project = project_info_getter(projectKey)
    if project.paths.model_dir is None:
        raise HTTPException(status_code=400, detail="Project model_dir is not configured.")
    model_dir = (Path(project.paths.model_dir) / modelRelativePath).resolve()
    try:
        model_dir.relative_to(project.paths.model_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid model path.")
    if not model_dir.exists():
        raise HTTPException(status_code=404, detail="Model directory not found.")

    stdout_path = model_dir / "train_stdout.log"
    stderr_path = model_dir / "train_stderr.log"
    status_path = model_dir / "train_status.json"

    def poller() -> Iterator[dict]:
        stdout_offset = 0
        stderr_offset = 0
        last_status: str | None = None

        while True:
            # Emit any new log lines
            stdout_lines, stdout_offset = _tail_log_file(stdout_path, stdout_offset)
            stderr_lines, stderr_offset = _tail_log_file(stderr_path, stderr_offset)
            all_lines = stdout_lines + [f"[stderr] {l}" for l in stderr_lines]
            if all_lines:
                yield {"type": "log", "lines": all_lines}

            # Emit status if it changed
            try:
                ts = TrainStatus.model_validate(json.loads(status_path.read_text()))
                if ts.status != last_status:
                    last_status = ts.status
                    yield {"type": "status", **ts.model_dump()}
            except Exception:
                pass

            if last_status in _TRAIN_TERMINAL:
                # Final drain
                stdout_lines, _ = _tail_log_file(stdout_path, stdout_offset)
                stderr_lines, _ = _tail_log_file(stderr_path, stderr_offset)
                final_lines = stdout_lines + [f"[stderr] {l}" for l in stderr_lines]
                if final_lines:
                    yield {"type": "log", "lines": final_lines}
                break

            time.sleep(0.2)

    return StreamingResponse(_stream_sse_sync(poller()), media_type="text/event-stream")
