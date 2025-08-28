import multiprocessing
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from aniposelib.cameras import CameraGroup
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.config import Config
from litpose_app.routes.project import ProjectInfo
from litpose_app.routes.rglob import RGlobRequest, rglob
from litpose_app.utils.fix_empty_first_row import fix_empty_first_row

router = APIRouter()

import logging

logger = logging.getLogger(__name__)


class BundleAdjustRequest(BaseModel):
    sessionKey: str  # name of the session with the view stripped out, used to lookup calibration files.


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


def _bundle_adjust_impl(
    request: BundleAdjustRequest, project_info: ProjectInfo, config: Config
):
    camera_group_toml_path = (
        project_info.data_dir
        / config.CALIBRATIONS_DIRNAME
        / f"{request.sessionKey}.toml"
    )
    cg = CameraGroup.load(camera_group_toml_path)
    views = list(map(lambda c: c.name, cg.cameras))
    assert set(project_info.views) == set(views)
    repl_pattern = "|".join([re.escape(s) for s in views])

    rglobresponse = rglob(
        RGlobRequest(baseDir=project_info.data_dir, pattern="*.csv", noDirs=True)
    )
    files = [str(project_info.data_dir / e.path) for e in rglobresponse.entries]

    def is_of_current_session(imgpath: str):
        parts = imgpath.split("/")
        if len(parts) < 3:
            return False
        return parts[1].replace(view, "") == request.sessionKey

    # Group multiview csv files
    files_by_view = defaultdict(dict)
    for csv in files:
        m = re.search(repl_pattern, Path(csv).name)
        if m is None:
            print(f"Skipping {csv} because no view name was present.")
            continue
        view = m.group(0)

        csv_key = csv.replace(view, "")
        files_by_view[csv_key][view] = csv

    # Validate view consistency
    # Iterate over a copy of the keys to safely delete from the original dictionary
    for csv_key in list(files_by_view.keys()):
        fbv = files_by_view[csv_key]
        if len(fbv) != len(views) or set(fbv.keys()) != set(views):
            print(f"Skipping {csv_key} because of inconsistent views")
            del files_by_view[csv_key]
            continue

    numpy_arrs = defaultdict(list)  # view -> list[np.ndarray]
    for csv_key in list(files_by_view.keys()):
        fbv = files_by_view[csv_key]
        dfs_by_view = {}

        # Read DFs
        for view in views:
            csv = fbv[view]
            print(csv)
            df = pd.read_csv(csv, header=[0, 1, 2], index_col=0)
            df = fix_empty_first_row(df)
            dfs_by_view[view] = df

        # Check that DFs are aligned
        index_values = dfs_by_view[views[0]].index.values
        firstview_framekeys = list(
            map(lambda s: s.replace(views[0], ""), dfs_by_view[views[0]].index.values)
        )
        for view in views:
            thisview_framekeys = list(
                map(lambda s: s.replace(view, ""), dfs_by_view[view].index.values)
            )
            if not firstview_framekeys == thisview_framekeys:
                print(f"Skipping {fbv[view]} because of misaligned indices")
                del dfs_by_view[csv_key]
                del files_by_view[csv_key]
                continue

        # Filter to frames of current session
        for view in views:
            df = dfs_by_view[view]
            dfs_by_view[view] = df.loc[
                df.index.to_series().apply(is_of_current_session)
            ]

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
            numpy_arrs[view].append(nparr)

    for view in views:
        # Concat all numpy (stack)
        numpy_arrs[view] = np.concat(numpy_arrs[view])

    output = np.stack([numpy_arrs[v] for v in views])
    cg.bundle_adjust_iter(output)
    cg.dump(camera_group_toml_path.with_suffix(".ba.toml"))
