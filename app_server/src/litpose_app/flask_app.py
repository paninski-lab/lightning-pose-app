from __future__ import annotations

import datetime
import re
from pathlib import Path

from flask import Flask, jsonify, request
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
from litpose_app.flask_routes.models import LegacySetProjectInfoRequest, SessionImportRequest
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

def _sanitize_and_suffix_filename(original_filename: str) -> str:
    """
    Sanitizes the original filename, ensures path traversal prevention,
    and adds a datetime suffix to the stem.

    - Converts filename to lowercase.
    - Replaces invalid characters (not a-z, 0-9, -, _) in stem and suffix with underscores.
    - Ensures only one dot for the file extension.
    - Adds a `_YYYYMMDDHHMMSS` suffix to the filename stem.
    - Returns a pathlib.Path object representing the sanitized and suffixed filename.
    """
    # Take only the basename to prevent any explicit path traversal attempts
    filename = Path(original_filename).name

    stem = Path(filename).stem
    suffix = Path(filename).suffix

    # Sanitize stem: allow a-z, 0-9, -, _
    sanitized_stem = re.sub(r'[^a-z0-9_-]', '_', stem.lower())

    # Sanitize suffix: allow a-z, 0-9, -, _
    sanitized_suffix = ""
    if suffix:
        # Remove the leading dot for sanitization, then add it back
        cleaned_suffix_content = re.sub(r'[^a-z0-9_-]', '_', suffix[1:].lower())
        if cleaned_suffix_content: # Ensure we don't end up with just "."
            sanitized_suffix = f".{cleaned_suffix_content}"

    # Add datetime suffix to the stem for uniqueness and cleanup
    now_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    final_stem = f"{sanitized_stem}_{now_str}"

    # Reconstruct the filename
    final_filename_str = f"{final_stem}{sanitized_suffix}"

    return final_filename_str

@app.post('/uploadVideoToStaging')
@validate()
def upload_video_for_transcoding():
    """Import a session from the uploaded file."""
    try:
        files = request.files.getlist('file')
        if not files:
            return jsonify({'error': 'No files provided'}), 400

        staging_dir = config.LP_DIR / "session_import_staging_area"
        staging_dir.mkdir(parents=True, exist_ok=True)

        final_filenames: list[str] = []
        for file in files:
            if not file.filename:
                continue

            # Sanitize filename, prevent path traversal, and add a datetime suffix
            final_filename = _sanitize_and_suffix_filename(file.filename)
            save_path = staging_dir / final_filename

            # If the file already exists (due to a rare hash collision or retry), delete it
            if save_path.exists():
                save_path.unlink()

            file.save(save_path)
            final_filenames.append(final_filename)

        return jsonify({
            'message': 'Session videos uploaded successfully',
            'files': final_filenames
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500
