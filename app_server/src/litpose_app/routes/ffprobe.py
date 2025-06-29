import json
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()


class FFProbeRequest(BaseModel):
    path: Path


class FFProbeResponse(BaseModel):
    codec: str
    width: int
    height: int
    fps: int
    duration: float


@router.post("/app/v0/rpc/ffprobe")
def ffprobe(request: FFProbeRequest) -> FFProbeResponse:
    if request.path.suffix != ".mp4":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only mp4 files are supported.",
        )

    result = run_ffprobe(str(request.path))

    response = FFProbeResponse.model_validate(result)

    return response


def run_ffprobe(video_path):
    """
    Executes ffprobe to get video metadata and parses the JSON output.

    Args:
        video_path (str): The path to the video file.

    Returns:
        dict: A dictionary containing the parsed metadata, or None if an error occurs.
    """
    command = [
        "ffprobe",
        "-v",
        "error",  # Suppress verbose output
        "-select_streams",
        "v:0",  # Select the first video stream
        "-show_entries",
        "format=duration:stream=avg_frame_rate,codec_name,width,height,display_aspect_ratio",
        "-of",
        "json",  # Output in JSON format
        video_path,
    ]

    # Initialize extracted_info with default/None values and an error key
    extracted_info = {
        "codec": None,
        "width": None,
        "height": None,
        "fps": None,
        "duration": None,
    }

    try:
        # Execute the ffprobe command
        process = subprocess.run(command, capture_output=True, text=True, check=True)

        # Parse the JSON output
        metadata = json.loads(process.stdout)

        # --- Extracting Data ---
        if "format" in metadata and "duration" in metadata["format"]:
            try:
                extracted_info["duration"] = float(metadata["format"]["duration"])
            except ValueError:
                extracted_info["error"] = (
                    f"Failed to parse duration: {metadata['format']['duration']}"
                )
                return extracted_info

        if "streams" in metadata and len(metadata["streams"]) > 0:
            video_stream = metadata["streams"][
                0
            ]  # Assuming we want the first video stream

            # Codec
            if "codec_name" in video_stream:
                extracted_info["codec"] = str(video_stream["codec_name"])

            # Width and Height
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

            # FPS
            if "avg_frame_rate" in video_stream:
                rate_str = video_stream["avg_frame_rate"]
                if "/" in rate_str:
                    try:
                        num, den = map(int, rate_str.split("/"))
                        if den != 0:  # Avoid division by zero
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
            "ffprobe command not found. Please ensure FFmpeg (which includes ffprobe) is installed and accessible in your system's PATH."
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
