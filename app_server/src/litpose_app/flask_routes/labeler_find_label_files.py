from __future__ import annotations

import concurrent.futures
import logging
from pathlib import Path
from typing import List

import pandas as pd

from litpose_app.config import Config
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row
from .models import RGlobRequest
from .rglob import rglob as rglob_logic
from .project import get_project_info

logger = logging.getLogger(__name__)


def _check_label_file_headers(relative_file_path: Path, base_dir: Path) -> Path | None:
    """Return the relative_file_path if it has valid DLC-style headers, else None."""
    full_file_path = base_dir / relative_file_path
    try:
        df = pd.read_csv(full_file_path, header=[0, 1, 2], nrows=0)
        df = fix_empty_first_row(df)

        if not isinstance(df.columns, pd.MultiIndex) or df.columns.nlevels != 3:
            logger.debug(
                "Skipping %s: not a multi-index header or not exactly 3 levels.",
                relative_file_path,
            )
            return None

        valid_columns = [col for col in df.columns if col[2] in ("x", "y")]
        if not valid_columns:
            logger.debug(
                "Skipping %s: no 'x' or 'y' coordinates in third header level.",
                relative_file_path,
            )
            return None

        scorer_bodypart_pairs = set((col[0], col[1]) for col in valid_columns)
        for scorer, bodypart in scorer_bodypart_pairs:
            has_x = any(col[0] == scorer and col[1] == bodypart and col[2] == "x" for col in valid_columns)
            has_y = any(col[0] == scorer and col[1] == bodypart and col[2] == "y" for col in valid_columns)
            if not (has_x and has_y):
                logger.debug(
                    "Skipping %s: bodypart '%s' under scorer '%s' missing x or y.",
                    relative_file_path,
                    bodypart,
                    scorer,
                )
                return None

        return relative_file_path
    except pd.errors.EmptyDataError:
        logger.debug("Skipping %s: CSV is empty.", relative_file_path)
        return None
    except Exception as e:
        logger.warning(
            "Error processing %s: %s - %s", relative_file_path, type(e).__name__, e
        )
        return None


def find_label_files_logic(config: Config) -> dict:
    """Return dict with key 'labelFiles' listing valid label CSV relative paths.

    Uses rglob_logic to find CSVs under data_dir, filters by header structure in threads.
    """
    project_info = get_project_info(config).projectInfo
    if project_info.data_dir is None:
        raise FileNotFoundError("Active project has no data_dir configured")

    data_dir = Path(project_info.data_dir)

    # List candidate CSV relative paths
    candidate_rel_paths: List[Path] = [
        e.path
        for e in rglob_logic(
            base_dir=data_dir,
            pattern="**/*.csv",
            no_dirs=True,
            do_stat=False,
        ).entries
    ]

    valid: list[Path] = []
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future_to_rel = {
            executor.submit(_check_label_file_headers, rel, data_dir): rel
            for rel in candidate_rel_paths
        }
        for future in concurrent.futures.as_completed(future_to_rel):
            try:
                res = future.result()
                if res is not None:
                    valid.append(res)
            except Exception as exc:
                logger.error("%s generated an exception during header check: %s", future_to_rel[future], exc)

    return {"labelFiles": [str(p) for p in valid]}
