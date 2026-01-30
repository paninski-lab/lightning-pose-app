import re
import shutil
import tempfile
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
from aniposelib.cameras import CameraGroup
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.config import Config
from litpose_app.datatypes import Project
from litpose_app.deps import ProjectInfoGetter
from litpose_app.routes.labeler import find_calibration_file, get_session_level_calibration_path
from litpose_app.tasks.extract_frames import MVLabelFile
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row

router = APIRouter()

import logging

logger = logging.getLogger(__name__)


class BundleAdjustRequest(BaseModel):
    projectKey: str
    mvlabelfile: MVLabelFile
    sessionKey: str  # name of the session with the view stripped out

    iterative: bool = True
    addl_bundle_adjust_kwargs: dict = {"only_extrinsics": True}


class BundleAdjustResponse(BaseModel):
    camList: list[str]
    """List of camera view names in order of the reprojection errors below."""

    oldReprojectionError: list[float]
    """List: one per camera."""

    newReprojectionError: list[float]
    """List: one per camera."""

    oldCgDicts: list[dict[str, Any]]
    """CameraGroup dictionaries (pre-adjustment), one per camera."""

    newCgDicts: list[dict[str, Any]]
    """CameraGroup dictionaries (post-adjustment), one per camera."""

    oldCgToml: str
    """Full CameraGroup TOML (pre-adjustment)."""

    newCgToml: str
    """Full CameraGroup TOML (post-adjustment)."""


class SaveCalibrationForSessionRequest(BaseModel):
    projectKey: str
    sessionKey: str  # name of the session with the view stripped out
    newCgToml: str


@router.post("/app/v0/rpc/bundleAdjust")
def bundle_adjust(
        request: BundleAdjustRequest,
        project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
        config: Config = Depends(deps.config),
) -> BundleAdjustResponse:
    with ProcessPoolExecutor(max_workers=1) as executor:
        project: Project = project_info_getter(request.projectKey)
        fut = executor.submit(
            _bundle_adjust_impl,
            request,
            project,
            config,
        )
        result = fut.result()

    return BundleAdjustResponse.model_validate(result)


def _bundle_adjust_impl(request: BundleAdjustRequest, project: Project, config: Config):
    camera_group_toml_path = find_calibration_file(request.sessionKey, project, config)
    if camera_group_toml_path is None:
        raise FileNotFoundError(
            f"Could not find calibration file for {request.sessionKey}"
        )
    cg = CameraGroup.load(camera_group_toml_path)
    old_cg_dicts = cg.get_dicts()
    old_cg_toml = dump_as_string(cg)

    views = list(map(lambda c: c.name, cg.cameras))

    # Group multiview csv files
    files_by_view = {v.viewName: v.csvPath for v in request.mvlabelfile.views}

    # Read DFs
    dfs_by_view = {}
    for view in views:
        try:
            csv = files_by_view[view]
        except KeyError as e:
            print(f"No CSV found for view from CameraGroup {view}")
            raise e
        df = pd.read_csv(csv, header=[0, 1, 2], index_col=0)
        df = fix_empty_first_row(df)
        dfs_by_view[view] = df
    views = list(dfs_by_view.keys())

    p2ds = get_p2ds(dfs_by_view, request.sessionKey)

    p3ds = cg.triangulate(p2ds)
    old_reprojection_error = cg.reprojection_error(p3ds, p2ds)
    if request.iterative:
        cg.bundle_adjust_iter(
            p2ds,
            verbose=True,
            **request.addl_bundle_adjust_kwargs,
        )
    else:
        cg.bundle_adjust(
            p2ds,
            verbose=True,
            **request.addl_bundle_adjust_kwargs,
        )
    new_cg_dicts = cg.get_dicts()
    new_cg_toml = dump_as_string(cg)
    p3ds = cg.triangulate(p2ds)
    new_reprojection_error = cg.reprojection_error(p3ds, p2ds)

    return {
        "camList": views,  # Add the camList
        "oldReprojectionError": np.linalg.norm(old_reprojection_error, axis=2)
        .sum(axis=1)
        .tolist(),
        "newReprojectionError": np.linalg.norm(new_reprojection_error, axis=2)
        .sum(axis=1)
        .tolist(),
        "oldCgDicts": old_cg_dicts,
        "newCgDicts": new_cg_dicts,
        "oldCgToml": old_cg_toml,
        "newCgToml": new_cg_toml,
    }


@router.post("/app/v0/rpc/saveCalibrationForSession")
def save_calibration_for_session(
        request: SaveCalibrationForSessionRequest,
        project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
        config: Config = Depends(deps.config),
) -> None:
    project = project_info_getter(request.projectKey)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".toml") as f:
        f.write(request.newCgToml)
        f.flush()
        cg = CameraGroup.load(f.name)

    session_level_calibration_path = get_session_level_calibration_path(request.sessionKey, project, config)

    if session_level_calibration_path.exists():
        backup_path = (
                project.paths.data_dir
                / config.CALIBRATIONS_DIRNAME
                / "backups"
                / session_level_calibration_path.name
                .replace(".toml",f"_og-{datetime.now().strftime('%Y%m%d-%H%M%S')}.toml")
        )
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(session_level_calibration_path, backup_path)

    session_level_calibration_path.parent.mkdir(parents=True, exist_ok=True)
    with open(session_level_calibration_path, "w") as f:
        f.write(request.newCgToml)


def dump_as_string(cg: CameraGroup) -> str:
    with tempfile.NamedTemporaryFile(
            mode="w+", suffix=".toml"
    ) as f:
        cg.dump(f.name)
        # Move cursor back to the start
        f.seek(0)
        return f.read()


def get_is_of_current_session(sessionKey):
    def is_of_current_session(imgpath: str):
        return re.search(f"^labeled-data/{re.escape(sessionKey)}_/", imgpath) is not None

    return is_of_current_session


def get_p2ds(dfs_by_view: dict[str, pd.DataFrame], sessionKey: str) -> list[np.ndarray]:
    # 1. Normalize Indices (Remove view-specific prefixes/suffixes)
    views = list(dfs_by_view.keys())
    for view in views:
        dfs_by_view[view].index = dfs_by_view[view].index.str.replace(
            view, "", regex=False
        )

    # 2. Identify the "Shared Valid Truth"
    valid_indices = None

    for view in views:
        df = dfs_by_view[view]

        # Filter: Session
        is_of_current_session = get_is_of_current_session(sessionKey=sessionKey.replace(view, ""))
        session_mask = df.index.map(is_of_current_session)

        # Filter: NaN coordinates (assuming MultiIndex level 2 is 'x' or 'y')
        coords_cols = df.columns.get_level_values(2).isin(["x", "y"])
        non_nan_mask = df.loc[:, coords_cols].notna().all(axis=1)

        # Combined valid frames for this specific view
        current_valid = df.index[session_mask & non_nan_mask]

        if valid_indices is None:
            valid_indices = current_valid
        else:
            valid_indices = valid_indices.intersection(current_valid)

    if valid_indices is None or len(valid_indices) == 0:
        raise RuntimeError(
            f"No synchronized valid frames found for session {sessionKey}."
        )

    logging.info(f"Final synchronized dataset contains {len(valid_indices)} frames.")

    # 3. Extract, Reshape, and Stack (CxNx2)
    # .reshape(-1, 2) turns [x1, y1, x2, y2...] into [[x1, y1], [x2, y2]...]
    processed_arrays = [
        dfs_by_view[v]
        .loc[
            valid_indices, (dfs_by_view[v].columns.get_level_values(2).isin(["x", "y"]))
        ]
        .to_numpy()
        .reshape(-1, 2)
        for v in views
    ]

    p2ds = np.stack(processed_arrays)
    return p2ds
