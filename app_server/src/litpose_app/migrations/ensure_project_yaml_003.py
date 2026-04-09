"Migration to ensure project.yaml exists and contains required fields."

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from litpose_app.datatypes import ProjectPaths

MIGRATION_ID = "003_ensure_project_yaml"
DESCRIPTION = "Ensure project.yaml exists and contains view_names and keypoint_names."

logger = logging.getLogger(__name__)


def needs_migration(paths: ProjectPaths) -> bool:
    project_yaml_path = paths.data_dir / "project.yaml"
    if not project_yaml_path.exists():
        return True
    try:
        with open(project_yaml_path, "r") as f:
            data = yaml.safe_load(f)
            # If it exists but is missing required fields, it needs migration (autocreation logic from deps.py)
            return not (
                isinstance(data, dict)
                and "view_names" in data
                and "keypoint_names" in data
            )
    except Exception:
        return True


def migrate(paths: ProjectPaths) -> None:
    """
    Tries to create project.yaml from other YAML files in the base_dir if it's missing or invalid.
    """
    base_dir = paths.data_dir
    project_yaml_file_path = base_dir / "project.yaml"

    # If it already exists and is valid, skip (double-check needs_migration)
    if project_yaml_file_path.exists():
        try:
            with open(project_yaml_file_path, "r") as f:
                data = yaml.safe_load(f)
                if (
                    isinstance(data, dict)
                    and "view_names" in data
                    and "keypoint_names" in data
                ):
                    return
        except Exception:
            pass

    yaml_files = base_dir.rglob("**/*.yaml")
    yaml_data = None

    for yf in yaml_files:
        # Don't use the file we're trying to create if it exists but is invalid
        if yf.resolve() == project_yaml_file_path.resolve():
            continue

        try:
            with open(yf, "r") as f:
                candidate_data = yaml.safe_load(f)
            if candidate_data and "data" in candidate_data:
                data_part = candidate_data["data"]
                if (
                    isinstance(data_part, dict)
                    and "view_names" in data_part
                    and "keypoint_names" in data_part
                    and data_part["view_names"] is not None
                    and data_part["keypoint_names"] is not None
                ):
                    # Found a suitable template
                    yaml_data = {
                        "view_names": data_part["view_names"],
                        "keypoint_names": data_part["keypoint_names"],
                        "schema_version": 1,
                    }
                    # Create the project.yaml file
                    with open(project_yaml_file_path, "w") as f:
                        yaml.dump(yaml_data, f)
                    logger.info(
                        f"Created {project_yaml_file_path} using template from {yf}"
                    )
                    break
        except Exception as e:
            logger.warning(
                "Exception during project.yaml autocreation from %s:\n%s",
                yf,
                e,
            )
            continue

    if yaml_data is None:
        logger.warning(
            "Could not find a suitable template to create project.yaml in %s", base_dir
        )
