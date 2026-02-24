from __future__ import annotations

import logging

from litpose_app.datatypes import ProjectPaths
from litpose_app.project import ProjectUtil
from litpose_app.rootconfig import RootConfig

from . import unlabeled_to_jsonl_001
from . import backfill_creation_datetime_002

logger = logging.getLogger(__name__)

MIGRATIONS = [
    unlabeled_to_jsonl_001,
    backfill_creation_datetime_002,
]


def run_migrations_for_project(paths: ProjectPaths) -> None:
    """Runs all pending migrations for a single project."""
    for m in MIGRATIONS:
        if m.needs_migration(paths):
            logger.info("Running migration %s: %s", m.MIGRATION_ID, m.DESCRIPTION)
            m.migrate(paths)


def run_migrations_for_all_projects(root_config: RootConfig) -> None:
    """Runs all pending migrations for every registered project in projects.toml."""
    util = ProjectUtil(root_config)
    all_projects = util.get_all_project_paths()

    for project_key, paths in all_projects.items():
        try:
            run_migrations_for_project(paths)
        except Exception:
            logger.exception(
                "Migration failed for project %s (data_dir=%s)",
                project_key,
                paths.data_dir,
            )
