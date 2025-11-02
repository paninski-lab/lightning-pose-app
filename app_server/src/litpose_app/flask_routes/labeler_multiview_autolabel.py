from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
from aniposelib.cameras import CameraGroup

from litpose_app.config import Config
from .models import (
    GetMVAutoLabelsRequest,
    GetMVAutoLabelsResponse,
    KeypointForRequest,
    KeypointForResponse,
    KPProjectedLabel,
    Point2D,
    Point3D,
)
from .project import get_project_info

logger = logging.getLogger(__name__)


def _session_level_config_path(session_key: str, data_dir: Path, config: Config) -> Path:
    return data_dir / config.CALIBRATIONS_DIRNAME / f"{session_key}.toml"


def _find_calibration_file(session_key: str, data_dir: Path, config: Config) -> Path | None:
    session_level = _session_level_config_path(session_key, data_dir, config)
    if session_level.is_file():
        return session_level
    global_path = data_dir / config.GLOBAL_CALIBRATION_PATH
    if global_path.is_file():
        return global_path
    return None


def _get_mv_auto_labels_for_keypoint(
    keypoint: KeypointForRequest, global_cg: CameraGroup
) -> KeypointForResponse:
    labeled_views = [label.view for label in keypoint.labels]
    kp_cg = global_cg.subset_cameras_names(labeled_views)

    # If fewer than 2 views labeled, skip triangulation
    if len(keypoint.labels) < 2:
        return KeypointForResponse(
            keypointName=keypoint.keypointName,
            triangulatedPt=None,
            projections=[KPProjectedLabel(view=cam.name) for cam in global_cg.cameras],
        )

    pts = np.array([[label.point.x, label.point.y] for label in keypoint.labels])
    point3d = kp_cg.triangulate(pts)
    reprojections = global_cg.project(point3d)

    labels_dict = {label.view: label.point for label in keypoint.labels}

    return KeypointForResponse(
        keypointName=keypoint.keypointName,
        triangulatedPt=Point3D(x=point3d[0], y=point3d[1], z=point3d[2]),
        projections=[
            KPProjectedLabel(
                view=view,
                projectedPoint=Point2D(x=proj[0][0], y=proj[0][1]),
                originalPoint=labels_dict.get(view),
                reprojection_error=(
                    None
                    if labels_dict.get(view) is None
                    else float(
                        np.linalg.norm(
                            np.array([labels_dict.get(view).x, labels_dict.get(view).y])
                            - proj[0]
                        )
                    )
                ),
            )
            for view, proj in zip((cam.name for cam in global_cg.cameras), reprojections)
        ],
    )


def get_mv_auto_labels_logic(
    request: GetMVAutoLabelsRequest, config: Config
) -> GetMVAutoLabelsResponse:
    project_info = get_project_info(config).projectInfo
    if project_info.data_dir is None:
        raise FileNotFoundError("Active project has no data_dir configured")

    data_dir = Path(project_info.data_dir)

    camera_group_toml_path = _find_calibration_file(request.sessionKey, data_dir, config)
    if camera_group_toml_path is None:
        raise FileNotFoundError(
            f"Could not find calibration file for session {request.sessionKey}"
        )

    global_cg = CameraGroup.load(camera_group_toml_path)

    results: list[KeypointForResponse] = []
    for kp in request.keypoints:
        results.append(_get_mv_auto_labels_for_keypoint(kp, global_cg))

    return GetMVAutoLabelsResponse(keypoints=results)
