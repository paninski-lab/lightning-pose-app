from pathlib import Path

from litpose_app.transcode_fine import transcode_file


def transcode_video_task(input_file_path: Path, output_file_path: Path):
    transcode_file(input_file_path, output_file_path)
