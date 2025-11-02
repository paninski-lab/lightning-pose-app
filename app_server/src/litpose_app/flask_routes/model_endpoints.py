from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
import logging
import yaml

from litpose_app.config import Config
from .models import (
    CreateTrainTaskRequest,
    CreateTrainTaskResponse,
    ListModelsResponse,
    ModelListResponseEntry,
    TrainStatus,
)
from .project import get_project_info

logger = logging.getLogger(__name__)


def create_train_task_logic(
    request: CreateTrainTaskRequest, config: Config
) -> CreateTrainTaskResponse:
    """Create a new model training task directory and seed config/status files.

    Mirrors FastAPI behavior with validation:
    - Ensures project model_dir is configured
    - Prevents path traversal by verifying the final path stays under model_dir
    - Fails with conflict if the model already exists
    """
    project_info = get_project_info(config).projectInfo
    if project_info is None or project_info.model_dir is None:
        raise ValueError("Project model_dir is not configured.")

    model_dir = Path(project_info.model_dir) / request.modelName
    model_dir = model_dir.resolve()

    # Ensure path is inside the declared model_dir
    try:
        model_dir.relative_to(project_info.model_dir)
    except Exception:
        raise ValueError("Invalid model name.")

    if model_dir.exists():
        # Signal conflict to the Flask route layer
        raise FileExistsError("Model already exists.")

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


def list_models_logic(config: Config) -> ListModelsResponse:
    """List models from the project's model_dir with metadata.

    If the directory is not configured or missing, return an empty list.
    """
    project_info = get_project_info(config).projectInfo
    models: list[ModelListResponseEntry] = []

    if project_info is None or project_info.model_dir is None:
        return ListModelsResponse(models=models)

    base = Path(project_info.model_dir)
    if not base.exists():
        # Optionally could return empty; raising FileNotFoundError lets caller map to 404
        return ListModelsResponse(models=models)

    def read_model_config(child_path: Path) -> ModelListResponseEntry:
        config_path = child_path / "config.yaml"
        status_path = child_path / "train_status.json"
        cfg = None
        status = None

        if config_path.is_file():
            try:
                content = config_path.read_text()
                cfg = yaml.safe_load(content)
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
            config=cfg,
            created_at=created_at,
            status=status,
        )

    paths = sorted([p for p in base.iterdir() if p.is_dir()])
    models = [read_model_config(p) for p in paths]

    return ListModelsResponse(models=models)
