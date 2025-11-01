from pathlib import Path

from flask import Flask, jsonify
from lightning_pose.project import get_project_config, get_all_projects
from pydantic import BaseModel

from litpose_app.config import Config
from flask_pydantic import validate
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
    projectInfo: LegacyProjectInfo # None if project info not yet initialized


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

