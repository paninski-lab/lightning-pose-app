import aniposelib.cameras
import numpy as np
from aniposelib.cameras import CameraGroup
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.routes.labeler import find_calibration_file
from litpose_app.routes.project import ProjectInfo

router = APIRouter()

import logging

logger = logging.getLogger(__name__)


class Point2D(BaseModel):
    x: float
    y: float


class Point3D(BaseModel):
    x: float
    y: float
    z: float


class KPLabel(BaseModel):
    view: str
    point: Point2D


class KPProjectedLabel(BaseModel):
    view: str
    # None if there were not enough labeled views to triangulate.
    originalPoint: Point2D | None = None
    projectedPoint: Point2D | None = None
    # Reprojection error, if the point was labeled.
    reprojection_error: float | None = None


class KeypointForRequest(BaseModel):
    keypointName: str
    labels: list[KPLabel]


class KeypointForResponse(BaseModel):
    keypointName: str
    # none if there were not enough labeled views to triangulate.
    triangulatedPt: Point3D | None = None
    projections: list[KPProjectedLabel] | None = None


class GetMVAutoLabelsRequest(BaseModel):
    sessionKey: str  # name of the session with the view stripped out, used to lookup calibration files.
    keypoints: list[KeypointForRequest]


class GetMVAutoLabelsResponse(BaseModel):
    # New keypoints obtained from triangulation + reprojection.
    # Client should patch their state with these.
    keypoints: list[KeypointForResponse]


@router.post("/app/v0/rpc/getMVAutoLabels")
def get_mv_auto_labels(
    request: GetMVAutoLabelsRequest,
    project_info: ProjectInfo = Depends(deps.project_info),
    config: deps.Config = Depends(deps.config),
) -> GetMVAutoLabelsResponse:
    # Read the toml files for this session.
    camera_group_toml_path = find_calibration_file(
        request.sessionKey, project_info, config
    )
    if camera_group_toml_path is None:
        raise FileNotFoundError(
            f"Could not find calibration file for session {request.sessionKey}"
        )

    global_cg = CameraGroup.load(camera_group_toml_path)

    results = []
    for keypoint in request.keypoints:
        res = _get_mv_auto_labels_for_keypoint(
            keypoint,
            global_cg,
        )
        results.append(res)

    return GetMVAutoLabelsResponse(keypoints=results)


def warm_up_anipose():
    """
    Invokes `aniposelib.cameras.triangulate_simple` once, because first invocation is
    slow (probably due to its use of @numba.jit).
    """
    # (aniposelib uses numba to improve numpy performance)
    from numba import config

    # On my PC this defaulted to OMP which then prevents the main process from fork().
    # (fork is necessary for any multiprocessing).
    # By switching to the simplest option, "workqueue" we also get the added benefit of more consistent
    # performance: with OMP some invocations of triangulation took ~100ms, but with workqueue, consistent ~10ms.
    config.THREADING_LAYER = "workqueue"

    try:
        cam0_mat = np.array(
            [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], dtype=np.float64
        )
        aniposelib.cameras.triangulate_simple(
            np.zeros((2, 2), dtype=np.float64),
            np.array([cam0_mat, cam0_mat], dtype=np.float64),
        )
        logger.debug("Successfully warmed up anipose.")
    except Exception as e:
        logger.error("Failed to warm up anipose: {}".format(e))


def _get_mv_auto_labels_for_keypoint(
    keypoint: KeypointForRequest, global_cg: CameraGroup
):
    # Anipose triangulate for each keypoint
    labeled_views = [label.view for label in keypoint.labels]
    kp_cg = global_cg.subset_cameras_names(labeled_views)
    # skip triangulation and return appropriate value if there are not enough labeled views
    if len(keypoint.labels) < 2:
        return KeypointForResponse(
            keypointName=keypoint.keypointName,
            triangulatedPt=None,
            projections=[KPProjectedLabel(view=cam.name) for cam in global_cg.cameras],
        )

    point3d = kp_cg.triangulate(
        # makes a Cx2 array.
        np.array([[label.point.x, label.point.y] for label in keypoint.labels])
    )
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
                            np.array(
                                [
                                    labels_dict.get(view).x,
                                    labels_dict.get(view).y,
                                ]
                            )
                            - proj[0]
                        )
                    )
                ),
            )
            for view, proj in zip(
                (cam.name for cam in global_cg.cameras), reprojections
            )
        ],
    )
