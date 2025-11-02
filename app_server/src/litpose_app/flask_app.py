from __future__ import annotations

import datetime
import re
from pathlib import Path

from flask import Flask, jsonify, request, Response
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
    GetYamlFileQuery,
    FFProbeRequest,
    write_multifile_logic,
    find_label_files_logic,
    save_mvframe_logic,
    get_mv_auto_labels_logic,
    bundle_adjust_logic,
    extract_frames_logic,
    create_train_task_logic,
    list_models_logic,
)
from litpose_app.flask_routes.models import (
    LegacySetProjectInfoRequest,
    SessionImportRequest,
    WriteMultifileRequest,
    SaveMvFrameRequest,
    GetMVAutoLabelsRequest,
    BundleAdjustRequest,
    ExtractFramesRequest,
    CreateTrainTaskRequest,
)
from litpose_app.flask_routes.project import set_project_info
from litpose_app.flask_routes.configs import load_yaml_relative
from litpose_app.flask_routes.ffprobe import ffprobe_logic
from pydantic import ValidationError

app = Flask(__name__)

config = Config()
app.config['lpconfig'] = config

def json_response(json_data: str | bytes, status: int = 200) -> Response:
    """Shorthand for creating a JSON-string Response object."""
    return Response(
        response=json_data,
        status=status,
        mimetype="application/json"
    )

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
def rglob():
    """Flask version of the rglob endpoint. Final URL will be /app/v0/rpc/rglob."""
    try:
        body = RGlobRequest.model_validate(request.json)
        result = rglob_logic(
            base_dir=body.baseDir,
            pattern=body.pattern,
            no_dirs=body.noDirs,
            do_stat=body.stat,
        )
        return json_response(result.model_dump_json())
    except ValueError as e:
        # Match previous 403 behavior when unsupported pattern is provided
        raise Forbidden(description=str(e))


@app.get('/getYamlFile')
@validate()
def getYamlFile(query: GetYamlFileQuery):
    """Loads a YAML file relative to the project's data_dir and returns a dict."""
    try:
        return load_yaml_relative(query.file_path, app.config['lpconfig'])
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.post('/ffprobe')
@validate()
def ffprobe(body: FFProbeRequest):
    """Runs ffprobe on a given video path and returns metadata."""
    try:
        return ffprobe_logic(body, app.config['lpconfig'])
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Forbidden as e:
        # Let Forbidden propagate with correct status, but Flask's jsonify is fine too
        raise e
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.post('/writeMultifile')
def writeMultifile():
    """Writes multiple files atomically using tmp rename under project data_dir."""
    try:
        body = WriteMultifileRequest.model_validate(request.json)
        result = write_multifile_logic(body, app.config['lpconfig'])
        return jsonify(result)
    except AssertionError as e:
        # Invalid filename/suffix → treat as forbidden
        raise Forbidden(description=str(e))
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.post('/findLabelFiles')
def findLabelFiles():
    """Find candidate label CSV files under project data_dir with valid headers."""
    try:
        result = find_label_files_logic(app.config['lpconfig'])
        return jsonify(result)
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.post('/save_mvframe')
def save_mvframe():
    """Save multiview frame edits with process-wide locking and atomic writes."""
    try:
        body = SaveMvFrameRequest.model_validate(request.json)
        save_mvframe_logic(body, app.config['lpconfig'])
        return jsonify({})
    except AssertionError as e:
        # invalid path/suffix → forbidden
        raise Forbidden(description=str(e))
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.post('/getMVAutoLabels')
@validate()
def getMVAutoLabels(body: GetMVAutoLabelsRequest):
    """Triangulate and project multiview keypoints using calibration files."""
    try:
        result = get_mv_auto_labels_logic(body, app.config['lpconfig'])
        return json_response(result.model_dump_json())
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.post('/bundleAdjust')
def bundleAdjust():
    """Run bundle adjustment and return per-camera reprojection errors."""
    try:
        body = BundleAdjustRequest.model_validate(request.json)
        result = bundle_adjust_logic(body, app.config['lpconfig'])
        return jsonify(result.model_dump())
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.post('/extractFrames')
def extractFrames():
    """Extract frames per request and update unlabeled sidecar files."""
    try:
        body = ExtractFramesRequest.model_validate(request.json)
        result = extract_frames_logic(body, app.config['lpconfig'])
        return jsonify(result)
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.post('/createTrainTask')
@validate()
def createTrainTask(body: CreateTrainTaskRequest):
    """Create a model training task directory and seed initial files."""
    try:
        result = create_train_task_logic(body, app.config['lpconfig'])
        return jsonify(result.model_dump())
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except FileExistsError as e:
        return jsonify({'error': str(e)}), 409
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.post('/listModels')
def listModels():
    """List models under the project's model_dir with metadata."""
    try:
        result = list_models_logic(app.config['lpconfig'])
        return jsonify(result.model_dump())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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


@app.post('/uploadFile')
def file_upload_handler():
    """Saves uploaded files to an internal staging directory for further processing."""
    try:
        files = request.files.getlist('file')
        if not files:
            return jsonify({'error': 'No files provided'}), 400

        staging_dir = config.UPLOADED_FILES_DIR
        staging_dir.mkdir(parents=True, exist_ok=True)

        final_filenames: list[str] = []
        for file in files:
            if not file.filename:
                continue

            # Sanitize filename, prevent path traversal, and add a datetime suffix
            final_filename = _sanitize_and_suffix_filename(file.filename)
            save_path = staging_dir / final_filename

            file.save(save_path)
            final_filenames.append(final_filename)

        return jsonify({
            'filenames': final_filenames
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500
