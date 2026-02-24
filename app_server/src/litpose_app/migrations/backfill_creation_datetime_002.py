"Backfill creation_datetime into model config.yaml files"

from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path

import yaml

from litpose_app.datatypes import ProjectPaths

logger = logging.getLogger(__name__)

MIGRATION_ID = "002_backfill_creation_datetime"
DESCRIPTION = "Backfill creation_datetime into model config.yaml files"

_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _find_model_configs(model_dir: Path) -> list[Path]:
    """Find all config.yaml files under model_dir (up to 2 levels deep)."""
    configs = []
    if not model_dir.is_dir():
        return configs
    for child in model_dir.iterdir():
        if not child.is_dir():
            continue
        cfg = child / "config.yaml"
        if cfg.is_file():
            configs.append(cfg)
        else:
            # One level deeper (e.g. outputs/YYYY-MM-DD/HH-MM-SS/)
            for grandchild in child.iterdir():
                if grandchild.is_dir() and (grandchild / "config.yaml").is_file():
                    configs.append(grandchild / "config.yaml")
    return configs


def _infer_creation_datetime(config_path: Path) -> str:
    """Infer creation datetime from directory path (YYYY-MM-DD), falling back to ctime."""
    for part in config_path.parent.parts:
        if _DATE_RE.fullmatch(part):
            return datetime.strptime(part, "%Y-%m-%d").isoformat()
    return datetime.fromtimestamp(config_path.parent.stat().st_ctime).isoformat()


def needs_migration(paths: ProjectPaths) -> bool:
    for cfg in _find_model_configs(paths.model_dir):
        try:
            data = yaml.safe_load(cfg.read_text())
            if isinstance(data, dict) and "creation_datetime" not in data:
                return True
        except Exception:
            continue
    return False


def migrate(paths: ProjectPaths) -> None:
    for cfg in _find_model_configs(paths.model_dir):
        try:
            text = cfg.read_text()
            data = yaml.safe_load(text)
            if not isinstance(data, dict):
                continue
            if "creation_datetime" in data:
                continue
            creation_dt = _infer_creation_datetime(cfg)
            data["creation_datetime"] = creation_dt
            cfg.write_text(yaml.dump(data, default_flow_style=False, sort_keys=False))
            logger.info("Backfilled creation_datetime=%s into %s", creation_dt, cfg)
        except Exception:
            logger.exception("Failed to backfill creation_datetime for %s", cfg)
