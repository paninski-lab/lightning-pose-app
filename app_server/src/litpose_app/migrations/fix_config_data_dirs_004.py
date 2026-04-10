"Fix data.data_dir and data.video_dir in model config.yaml to match current project data_dir"

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from litpose_app.datatypes import ProjectPaths

logger = logging.getLogger(__name__)

MIGRATION_ID = "004_fix_config_data_dirs"
DESCRIPTION = "Fix data.data_dir and data.video_dir in model config.yaml to match current project data_dir"


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


def needs_migration(paths: ProjectPaths) -> bool:
    for cfg in _find_model_configs(paths.model_dir):
        try:
            data = yaml.safe_load(cfg.read_text())
            if not isinstance(data, dict):
                continue
            data_section = data.get("data", {})
            if not isinstance(data_section, dict):
                continue
            if data_section.get("data_dir") != str(paths.data_dir):
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
            data_section = data.get("data")
            if not isinstance(data_section, dict):
                continue
            if "data_dir" not in data_section:
                continue

            old_data_dir = data_section["data_dir"]
            new_data_dir = str(paths.data_dir)

            if old_data_dir == new_data_dir:
                continue

            data_section["data_dir"] = new_data_dir
            logger.info("Updated data_dir: %s -> %s in %s", old_data_dir, new_data_dir, cfg)

            old_video_dir = data_section.get("video_dir")
            if old_video_dir is not None:
                try:
                    relative_suffix = Path(old_video_dir).relative_to(Path(old_data_dir))
                    new_video_dir = str(paths.data_dir / relative_suffix)
                    data_section["video_dir"] = new_video_dir
                    logger.info(
                        "Updated video_dir: %s -> %s in %s", old_video_dir, new_video_dir, cfg
                    )
                except ValueError:
                    logger.warning(
                        "Could not migrate video_dir %r in %s: not relative to old data_dir %r",
                        old_video_dir,
                        cfg,
                        old_data_dir,
                    )

            cfg.write_text(yaml.dump(data, default_flow_style=False, sort_keys=False))
        except Exception:
            logger.exception("Failed to fix config data dirs for %s", cfg)
