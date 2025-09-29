import multiprocessing
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
from aniposelib.cameras import CameraGroup
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.config import Config
from litpose_app.routes.project import ProjectInfo
from litpose_app.tasks.extract_frames import MVLabelFile
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row

router = APIRouter()

import logging

logger = logging.getLogger(__name__)


class BundleAdjustRequest(BaseModel):
    mvlabelfile: MVLabelFile
    sessionKey: str  # name of the session with the view stripped out


@router.post("/app/v0/rpc/bundleAdjust")
def bundle_adjust(
    request: BundleAdjustRequest,
    project_info: ProjectInfo = Depends(deps.project_info),
    config: Config = Depends(deps.config),
):
    p = multiprocessing.Process(
        target=_bundle_adjust_impl, args=(request, project_info, config)
    )
    p.start()
    p.join()
    return "ok"


def _session_level_config_path(
    session_key: str, project_info: ProjectInfo, config: Config
) -> Path:
    return project_info.data_dir / config.CALIBRATIONS_DIRNAME / f"{session_key}.toml"


def _find_calibration_file(
    session_key: str, project_info: ProjectInfo, config: Config
) -> None | Path:
    session_level_path = _session_level_config_path(session_key, project_info, config)
    if session_level_path.is_file():
        return session_level_path

    global_calibrations_path = project_info.data_dir / config.global_calibrations_path
    if global_calibrations_path.is_file():
        return global_calibrations_path

    return None


def _bundle_adjust_impl(
    request: BundleAdjustRequest, project_info: ProjectInfo, config: Config
):
    camera_group_toml_path = _find_calibration_file(
        request.sessionKey, project_info, config
    )
    if camera_group_toml_path is None:
        raise FileNotFoundError(f"Could not find calibration file for {session_key}")
    cg = CameraGroup.load(camera_group_toml_path)
    views = list(map(lambda c: c.name, cg.cameras))
    assert set(project_info.views) == set(views)

    def is_of_current_session(imgpath: str):
        parts = imgpath.split("/")
        if len(parts) < 3:
            return False
        return parts[-2].replace(view, "") == request.sessionKey

    # Group multiview csv files
    files_by_view = {
        project_info.data_dir / v.csvPath for v in request.mvlabelfile.views
    }

    numpy_arrs: dict[str, np.ndarray] = dict  # view -> np.ndarray

    # Read DFs
    dfs_by_view = {}
    for view in views:
        csv = files_by_view[view]
        df = pd.read_csv(csv, header=[0, 1, 2], index_col=0)
        df = fix_empty_first_row(df)
        dfs_by_view[view] = df

    # Check that DFs are aligned
    index_values = dfs_by_view[views[0]].index.values
    firstview_framekeys = list(map(lambda s: s.replace(views[0], ""), index_values))
    for view in views:
        thisview_framekeys = list(
            map(lambda s: s.replace(view, ""), dfs_by_view[view].index.values)
        )
        if not firstview_framekeys == thisview_framekeys:
            print(f"Skipping {files_by_view[view]} because of misaligned indices")
            del files_by_view[view]
            continue

    # Filter to frames of current session
    for view in views:
        df = dfs_by_view[view]
        dfs_by_view[view] = df.loc[df.index.to_series().apply(is_of_current_session)]

    # Normalize columns: x, y alternating.
    for view in views:
        df = dfs_by_view[view]

        picked_columns = [c for c in df.columns if c[2] in ("x", "y")]
        assert len(picked_columns) % 2 == 0
        assert (
            picked_columns[::2][0][2] == "x"
            and len(set(list(map(lambda t: t[2], picked_columns[::2])))) == 1
        )
        assert (
            picked_columns[1::2][0][2] == "y"
            and len(set(list(map(lambda t: t[2], picked_columns[1::2])))) == 1
        )
        dfs_by_view[view] = df.loc[:, picked_columns]

    # Convert to numpy
    for view in views:
        df = dfs_by_view[view]
        nparr = df.to_numpy()
        # Convert from x, y alternating columns to just x, y columns
        # (bodyparts move from columns to rows).
        nparr = nparr.reshape(-1, 2)
        numpy_arrs[view] = nparr

    output = np.stack([numpy_arrs[v] for v in views])
    cg.bundle_adjust_iter(output)
    target_path = _session_level_config_path(request.sessionKey, project_info, config)
    if target_path.exists():
        backup_path = config.calibration_backups_dirname / target_path.name.with_suffix(
            f".{time.time_ns()}.toml"
        )
        os.rename(target_path, backup_path)
    cg.dump(camera_group_toml_path)
