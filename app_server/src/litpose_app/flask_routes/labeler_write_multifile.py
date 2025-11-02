from __future__ import annotations

from pathlib import Path
from typing import Iterable

from litpose_app.config import Config
from .models import WriteMultifileRequest
from .project import get_project_info


def _validate_target_paths(request: WriteMultifileRequest, data_dir: Path) -> list[Path]:
    """Validate target filenames and return resolved Paths.

    - Must reside under project data_dir
    - Suffix must be one of .csv or .unlabeled
    """
    resolved: list[Path] = []
    for view in request.views:
        p = Path(view.filename).resolve()
        try:
            p.relative_to(data_dir)
        except Exception:
            raise AssertionError("Invalid filename")
        if p.suffix not in (".csv", ".unlabeled"):
            raise AssertionError("Invalid suffix")
        resolved.append(p)
    return resolved


def write_multifile_logic(request: WriteMultifileRequest, config: Config) -> str:
    """Write multiple files atomically (per file) using tmp rename pattern.

    Mirrors FastAPI version, but synchronously.
    """
    project_info = get_project_info(config).projectInfo
    if project_info.data_dir is None:
        raise FileNotFoundError("Active project has no data_dir configured")

    data_dir = Path(project_info.data_dir)

    # Validate targets and compute resolved paths
    targets = _validate_target_paths(request, data_dir)

    # 1) Write tmp files
    tmps: list[Path] = []
    for view, target in zip(request.views, targets):
        tmp = target.with_name(target.name + ".lptmp")
        tmp.write_text(view.contents)
        tmps.append(tmp)

    # 2) Atomically rename tmp to final
    for tmp, target in zip(tmps, targets):
        tmp.replace(target)

    return "ok"
