import os
import re
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd
from aniposelib.cameras import CameraGroup
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.config import Config
from litpose_app.routes.labeler import find_calibration_file, session_level_config_path
from litpose_app.routes.project import ProjectInfo
from litpose_app.tasks.extract_frames import MVLabelFile
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row

router = APIRouter()

import logging

logger = logging.getLogger(__name__)


class BundleAdjustRequest(BaseModel):
    mvlabelfile: MVLabelFile
    sessionKey: str  # name of the session with the view stripped out


class BundleAdjustResponse(BaseModel):
    camList: list[str]
    """List of camera view names in order of the reprojection errors below."""

    oldReprojectionError: list[float]
    """List: one per camera."""

    newReprojectionError: list[float]
    """List: one per camera."""


@router.post("/app/v0/rpc/bundleAdjust")
def bundle_adjust(
    request: BundleAdjustRequest,
    project_info: ProjectInfo = Depends(deps.project_info),
    config: Config = Depends(deps.config),
) -> BundleAdjustResponse:
    with ProcessPoolExecutor(max_workers=1) as executor:
        fut = executor.submit(
            _bundle_adjust_impl,
            request,
            project_info,
            config,
        )
        result = fut.result()

    return BundleAdjustResponse.model_validate(result)



def _bundle_adjust_impl(
    request: BundleAdjustRequest, project_info: ProjectInfo, config: Config
):
    camera_group_toml_path = find_calibration_file(
        request.sessionKey, project_info, config
    )
    if camera_group_toml_path is None:
        raise FileNotFoundError(
            f"Could not find calibration file for {request.sessionKey}"
        )
    cg = CameraGroup.load(camera_group_toml_path)
    views = list(map(lambda c: c.name, cg.cameras))
    assert set(project_info.views) == set(views)

    def autoLabelSessionKey(framePath: str) -> str | None:
        parts = framePath.split("/")
        if len(parts) < 3:
            return False
        sessionViewName = parts[-2] # e.g. 05272019_fly1_0_R1C24_Cam-A_rot-ccw-0.06_sec
        # Replace view with *, e.g. 05272019_fly1_0_R1C24_*_rot-ccw-0.06_sec
        sessionkey_from_frame = re.sub(
            rf"({'|'.join([re.escape(_v) for _v in views])})", "*", sessionViewName
        )
        parts_hyphenated = sessionkey_from_frame.split('-')
        if '*' in parts_hyphenated:
            return '-'.join(filter(lambda x: x != '*', parts_hyphenated))

        # 05272019_fly1_0_R1C24_*_rot-ccw-0.06_sec will be split correctly.
        parts_underscored = sessionkey_from_frame.split('_')

        # if underscore is the delimeter, * will be a token by itself
        if '*' in parts_underscored:
            return '_'.join(filter(lambda x: x != '*', parts_underscored))
        return None

    def is_of_current_session(imgpath: str):
        return autoLabelSessionKey(imgpath) == request.sessionKey

    # Group multiview csv files
    files_by_view = {v.viewName: v.csvPath for v in request.mvlabelfile.views}

    numpy_arrs: dict[str, np.ndarray] = {}  # view -> np.ndarray

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

    # Creates a CxNx2 np array for anipose
    p2ds = np.stack([numpy_arrs[v] for v in views])
    p3ds = cg.triangulate(p2ds)
    old_reprojection_error = cg.reprojection_error(p3ds, p2ds)
    cg.bundle_adjust(p2ds, verbose=True)
    p3ds = cg.triangulate(p2ds)
    new_reprojection_error = cg.reprojection_error(p3ds, p2ds)
    target_path = session_level_config_path(request.sessionKey, project_info, config)

    if target_path.exists():
        backup_path = (
            project_info.data_dir
            / config.CALIBRATION_BACKUPS_DIRNAME
            / target_path.with_suffix(f".{time.time_ns()}.toml").name
        )
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        os.rename(target_path, backup_path)

    # Writes to session-level calibration file even if the
    # project level calibration file was used for bundle adjustment.
    session_level_calibration_path = session_level_config_path(
        request.sessionKey, project_info, config
    )
    session_level_calibration_path.parent.mkdir(parents=True, exist_ok=True)
    cg.dump(session_level_calibration_path)

    return {
        "camList": views,  # Add the camList
        "oldReprojectionError": np.linalg.norm(
            old_reprojection_error, axis=2
        )  # Change key to camelCase
        .sum(axis=1)
        .tolist(),
        "newReprojectionError": np.linalg.norm(
            new_reprojection_error, axis=2
        )  # Change key to camelCase
        .sum(axis=1)
        .tolist(),
    }
