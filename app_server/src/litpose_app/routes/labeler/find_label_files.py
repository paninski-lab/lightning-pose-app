import concurrent
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends

from litpose_app import deps
from litpose_app.routes.project import ProjectInfo
from litpose_app.routes.rglob import RGlobRequest, rglob
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row

router = APIRouter()

import logging

logger = logging.getLogger(__name__)


@router.post("/app/v0/rpc/findLabelFiles")
def find_label_files(project_info: ProjectInfo = Depends(deps.project_info)):
    """
    A separate RPC for finding label files is needed because while the client
    has access to the RGlob RPC, RGlobbing for CSVs results in too broad of a search.
    The user may have CSVs in the data directory that are not label files.

    Instead, this endpoint first performs an rglob, but then it filters for CSVs
    that have the requisite headers to be viewed in the labeler. It uses multithreading
    to make this fast.

    Label files must have 3 header rows (scorer, bodypart, and x|y).
    We don't assume any fixed set of bodyparts.
    We just look for a unique set of bodyparts that must have both x and y.
    """

    # Get the list of files that match the glob pattern.
    # This is a list of Path objects.
    candidate_label_files_relative_paths = [
        e.path
        for e in rglob(
            RGlobRequest(
                baseDir=project_info.data_dir,
                pattern="**/*.csv",
                noDirs=True,
                stat=False,
            )
        ).entries
    ]
    # For each path, read the first 3 rows of the CSV with pandas and check
    # That the headers meet the requirements. Multithreaded.

    valid_label_files_relative_paths = []
    # Using ThreadPoolExecutor for I/O bound tasks
    with concurrent.futures.ThreadPoolExecutor() as executor:
        # Submit all tasks and store future objects
        future_to_file = {
            executor.submit(
                _check_label_file_headers, rel_path, project_info.data_dir
            ): rel_path
            for rel_path in candidate_label_files_relative_paths
        }
        for future in concurrent.futures.as_completed(future_to_file):
            original_relative_path = future_to_file[future]
            try:
                result_relative_path = future.result()
                if result_relative_path:
                    valid_label_files_relative_paths.append(result_relative_path)
            except Exception as exc:
                logger.error(
                    f"{original_relative_path} generated an exception during header check: {exc}"
                )

    return {"labelFiles": valid_label_files_relative_paths}


def _check_label_file_headers(relative_file_path: Path, base_dir: Path) -> Path | None:
    """
    Checks if a given CSV file (relative path) has the required label file headers.
    Returns the relative_file_path if valid, otherwise None.
    """
    full_file_path = base_dir / relative_file_path
    try:
        # Read only the header rows to save memory and time for large files
        df = pd.read_csv(full_file_path, header=[0, 1, 2], nrows=0)
        df = fix_empty_first_row(df)

        # Check for multi-index header with exactly 3 levels (AI-gen code, not sure if this is necessary).
        if not isinstance(df.columns, pd.MultiIndex) or df.columns.nlevels != 3:
            logger.debug(
                f"Skipping {relative_file_path}: not a multi-index header or not exactly 3 levels."
            )
            return None

        # Extract unique (scorer, bodypart) pairs from the first two levels
        # Filter out columns where the third level is not 'x' or 'y' before forming pairs
        valid_columns = [col for col in df.columns if col[2] in ("x", "y")]
        if not valid_columns:
            logger.debug(
                f"Skipping {relative_file_path}: no 'x' or 'y' coordinates found in third header level."
            )
            return None

        scorer_bodypart_pairs = set([(col[0], col[1]) for col in valid_columns])

        for scorer, bodypart in scorer_bodypart_pairs:
            has_x = False
            has_y = False
            for col in valid_columns:
                if col[0] == scorer and col[1] == bodypart:
                    if col[2] == "x":
                        has_x = True
                    elif col[2] == "y":
                        has_y = True
            if not (has_x and has_y):
                logger.debug(
                    f"Skipping {relative_file_path}: bodypart '{bodypart}' under scorer '{scorer}' does not have both 'x' and 'y' coordinates."
                )
                return None

        # If all checks pass, return the relative file path as a string
        return relative_file_path
    except pd.errors.EmptyDataError:
        logger.debug(f"Skipping {relative_file_path}: CSV is empty.")
        return None
    except Exception as e:
        logger.warning(
            f"Error processing {relative_file_path}: {type(e).__name__} - {e}"
        )
        return None
