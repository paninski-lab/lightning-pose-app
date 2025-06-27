from pathlib import Path

from litpose_app.transcode_fine import transcode_file


def transcode_video_task(input_file_path: Path, output_dir: Path):
    """
    Huey task wrapper for the transcode_file function.
    Executes the actual transcoding and returns a serializable dictionary.
    """
    success, message, output_path = transcode_file(input_file_path, output_dir)
    return {
        "success": success,
        "message": message,
        "output_path": str(output_path) if output_path else None,
    }
