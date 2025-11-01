from pathlib import Path

from flask import Flask, jsonify
from lightning_pose.project import get_project_config, get_all_projects
from pydantic import BaseModel

from litpose_app.config import Config
from flask_pydantic import validate

# Additional imports for rglob functionality
import datetime
from wcmatch import pathlib as w

app = Flask(__name__)

config = Config()
app.config['lpconfig'] = config


class LegacyProjectInfo(BaseModel):
    """Class to hold information about the project"""
    data_dir: Path | None = None
    model_dir: Path | None = None
    views: list[str] | None = None
    keypoint_names: list[str] | None = None


class LegacyGetProjectInfoResponse(BaseModel):
    projectInfo: LegacyProjectInfo  # None if project info not yet initialized


@app.post('/getProjectInfo')
@validate()
def getProjectInfo():
    """
    Returns the ProjectLocation and ProjectConfig of the active project.

    If there are no projects, returns 404.
    """

    try:
        all_projects = get_all_projects()
    except FileNotFoundError:
        return jsonify({'error': 'No projects found'}), 404

    try:
        with open(app.config['lpconfig'].ACTIVE_PROJECT_FILE_PATH, 'r') as f:
            active_project_key = f.read().strip()
    except FileNotFoundError:
        active_project_key = None

    # If the active project is invalid, reset it to the first project (projects list page not yet implemented).
    if active_project_key not in (p.project_key for p in all_projects):
        active_project_key = all_projects[0].project_key
        with open(app.config['lpconfig'].ACTIVE_PROJECT_FILE_PATH, 'w') as f:
            f.write(active_project_key)

    project = get_project_config(active_project_key)
    return LegacyGetProjectInfoResponse(projectInfo=LegacyProjectInfo(
        data_dir=project.project_locator.data_dir,
        model_dir=project.project_locator.model_dir,
        views=project.view_names,
        keypoint_names=project.keypoint_names,
    ))


# ---- RGlob migration from FastAPI to Flask ----
class RGlobRequest(BaseModel):
    baseDir: Path
    pattern: str
    noDirs: bool = False
    stat: bool = False


class RGlobResponseEntry(BaseModel):
    path: Path

    # Present only if request had stat=True or noDirs=True
    type: str | None

    # Present only if request had stat=True
    size: int | None
    # Creation timestamp, ISO format.
    cTime: str | None
    # Modified timestamp, ISO format.
    mTime: str | None


class RGlobResponse(BaseModel):
    entries: list['RGlobResponseEntry']
    relativeTo: Path  # this is going to be the same base_dir that was in the request.


@app.post('/rglob')
@validate()
def rglob(body: RGlobRequest) -> RGlobResponse:
    """Flask version of the rglob endpoint. Final URL will be /app/v0/rpc/rglob."""
    # Prevent secrets like /etc/passwd and ~/.ssh/ from being leaked.
    from werkzeug.exceptions import Forbidden
    if not (
        body.pattern.endswith('.csv')
        or body.pattern.endswith('.mp4')
        or body.pattern.endswith('.toml')
    ):
        # Match FastAPI's 403 behavior
        raise Forbidden(description='Only csv, mp4, toml files are supported.')

    response = RGlobResponse(entries=[], relativeTo=body.baseDir)

    results = _rglob(
        str(body.baseDir),
        pattern=body.pattern,
        no_dirs=body.noDirs,
        stat=body.stat,
    )
    for r in results:
        converted = RGlobResponseEntry.model_validate(r)
        response.entries.append(converted)

    return response


def _rglob(base_path, pattern=None, no_dirs=False, stat=False):
    """
    Needs to be performant when searching over large model directory.
    Uses wcmatch to exclude directories with extra calls to Path.is_dir.
    wcmatch includes features that may be helpful down the line.
    """
    if pattern is None:
        pattern = "**/*"
    flags = w.GLOBSTAR
    if no_dirs:
        flags |= w.NODIR
    results = w.Path(base_path).glob(
        pattern,
        flags=flags,
    )
    result_dicts = []
    for r in results:
        stat_info = r.stat() if stat else None
        is_dir = False if no_dirs else r.is_dir() if stat else None
        if no_dirs and is_dir:
            continue
        entry_relative_path = r.relative_to(base_path)
        d = {
            'path': entry_relative_path,
            'type': 'dir' if is_dir else 'file' if is_dir == False else None,
            'size': stat_info.st_size if stat_info else None,
            # Note: st_birthtime is more reliable for creation time on some systems
            'cTime': (
                datetime.datetime.fromtimestamp(
                    getattr(stat_info, 'st_birthtime', stat_info.st_ctime)
                ).isoformat()
                if stat_info
                else None
            ),
            'mTime': (
                datetime.datetime.fromtimestamp(stat_info.st_mtime).isoformat()
                if stat_info
                else None
            ),
        }

        result_dicts.append(d)
    return result_dicts

