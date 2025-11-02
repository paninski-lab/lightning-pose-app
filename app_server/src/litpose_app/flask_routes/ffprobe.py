from __future__ import annotations

from pathlib import Path

from werkzeug.exceptions import Forbidden

from litpose_app.config import Config
from .models import FFProbeRequest, FFProbeResponse

import json
import subprocess


def ffprobe_logic(request: FFProbeRequest, config: Config) -> FFProbeResponse:
    """Validate request and run ffprobe, returning a typed response.

    Raises FileNotFoundError if the file does not exist.
    Raises Forbidden if the suffix is not .mp4.
    May raise ValueError for parse/validation issues.
    """
    path = Path(request.path)
    if path.suffix != ".mp4":
        raise Forbidden(description="Only mp4 files are supported.")

    if not path.exists():
        raise FileNotFoundError(str(path))

    result = run_ffprobe(str(path))
    # Accept partial information: the model fields are optional in Flask copy
    return FFProbeResponse.model_validate(result)


def run_ffprobe(video_path: str) -> dict:
    """
    Executes ffprobe to get video metadata and parses the JSON output.
    Returns a dict with codec, width, height, fps, duration (or None values) and
    possibly an 'error' key with a message on failures.
    """
    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "format=duration:stream=avg_frame_rate,codec_name,width,height,display_aspect_ratio",
        "-of",
        "json",
        video_path,
    ]

    extracted_info: dict = {
        "codec": None,
        "width": None,
        "height": None,
        "fps": None,
        "duration": None,
    }

    try:
        process = subprocess.run(command, capture_output=True, text=True, check=True)
        metadata = json.loads(process.stdout)

        if "format" in metadata and "duration" in metadata["format"]:
            try:
                extracted_info["duration"] = float(metadata["format"]["duration"])
            except ValueError:
                extracted_info["error"] = (
                    f"Failed to parse duration: {metadata['format']['duration']}"
                )
                return extracted_info

        if "streams" in metadata and len(metadata["streams"]) > 0:
            video_stream = metadata["streams"][0]

            if "codec_name" in video_stream:
                extracted_info["codec"] = str(video_stream["codec_name"])

            if "width" in video_stream:
                try:
                    extracted_info["width"] = int(video_stream["width"])
                except ValueError:
                    extracted_info["error"] = (
                        f"Failed to parse width: {video_stream['width']}"
                    )
                    return extracted_info
            if "height" in video_stream:
                try:
                    extracted_info["height"] = int(video_stream["height"])
                except ValueError:
                    extracted_info["error"] = (
                        f"Failed to parse height: {video_stream['height']}"
                    )
                    return extracted_info

            if "avg_frame_rate" in video_stream:
                rate_str = video_stream["avg_frame_rate"]
                if "/" in rate_str:
                    try:
                        num, den = map(int, rate_str.split("/"))
                        if den != 0:
                            extracted_info["fps"] = round(num / den)
                        else:
                            extracted_info["error"] = (
                                f"Framerate denominator is zero: {rate_str}"
                            )
                            return extracted_info
                    except ValueError:
                        extracted_info["error"] = (
                            f"Failed to parse fractional framerate: {rate_str}"
                        )
                        return extracted_info
                else:
                    try:
                        extracted_info["fps"] = round(float(rate_str))
                    except ValueError:
                        extracted_info["error"] = (
                            f"Failed to parse float framerate: {rate_str}"
                        )
                        return extracted_info

        return extracted_info

    except FileNotFoundError:
        extracted_info["error"] = (
            "ffprobe command not found. Ensure FFmpeg (incl. ffprobe) is installed and in PATH."
        )
        return extracted_info
    except subprocess.CalledProcessError as e:
        extracted_info["error"] = (
            f"ffprobe command failed with exit code {e.returncode}. "
            f"Command: {' '.join(command)}. "
            f"Stdout: {e.stdout.strip()}. "
            f"Stderr: {e.stderr.strip()}"
        )
        return extracted_info
    except json.JSONDecodeError as e:
        extracted_info["error"] = (
            f"Failed to parse JSON output from ffprobe. Error details: {e}. "
            f"ffprobe stdout (attempted JSON): {process.stdout.strip()}"
        )
        return extracted_info
    except Exception as e:
        extracted_info["error"] = f"An unexpected error occurred: {e}"
        return extracted_info
