from __future__ import annotations

from flask import Flask, jsonify
from flask_pydantic import validate
from werkzeug.exceptions import Forbidden

from litpose_app.config import Config
from litpose_app.flask_routes import (
    LegacyGetProjectInfoResponse,
    LegacyProjectInfo,
    RGlobRequest,
    RGlobResponse,
    get_project_info,
    rglob_logic,
)
from litpose_app.flask_routes.models import LegacySetProjectInfoRequest
from litpose_app.flask_routes.project import set_project_info

app = Flask(__name__)

config = Config()
app.config['lpconfig'] = config


@app.post('/getProjectInfo')
@validate()
def getProjectInfo() -> LegacyGetProjectInfoResponse | tuple[object, int]:
    """Returns the ProjectLocation and ProjectConfig of the active project.

    If there are no projects, returns 404.
    """
    try:
        return get_project_info(app.config['lpconfig'])
    except FileNotFoundError:
        return jsonify({'error': 'No projects found'}), 404


@app.post('/setProjectInfo')
@validate()
def setProjectInfo(body: LegacySetProjectInfoRequest):
    """Sets the project information for the active project.
    
    Args:
        body: Request containing project information to set
        
    Returns:
        Empty JSON object on success
    """
    try:
        set_project_info(app.config['lpconfig'], body)
        return jsonify({})
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404


@app.post('/rglob')
@validate()
def rglob(body: RGlobRequest) -> RGlobResponse:
    """Flask version of the rglob endpoint. Final URL will be /app/v0/rpc/rglob."""
    try:
        return rglob_logic(
            base_dir=body.baseDir,
            pattern=body.pattern,
            no_dirs=body.noDirs,
            do_stat=body.stat,
        )
    except ValueError as e:
        # Match previous 403 behavior when unsupported pattern is provided
        raise Forbidden(description=str(e))
