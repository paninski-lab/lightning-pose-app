import json
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

router = APIRouter()


from litpose_app import deps
from litpose_app.deps import ProjectInfoGetter


class FFProbeRequest(BaseModel):
    # Project scoping (required by new API contract). The value is validated via
    # the dependency below; the route itself doesn't use the Project object.
    projectKey: str
    path: Path


class FFProbeResponse(BaseModel):
    file_path: str  # Path to the video file
    duration: float  # Duration of the video in seconds
    width: int  # Width of the video in pixels
    height: int  # Height of the video in pixels
    fps: int  # Average frame rate of the video
    format: str  # Format/container of the video
    size: int  # File size in bytes
    codec: str  # Video codec used
    is_vfr: bool  # Whether the video has a variable frame rate
    bitrate_str: str  # Nicely formatted bitrate (e.g., "1.5 Mbps")
    aspect_ratio: str  # Display aspect ratio
    color_space: str  # Color space and HDR information


@router.post("/app/v0/rpc/ffprobe")
def ffprobe(
    request: FFProbeRequest,
    project_info_getter: ProjectInfoGetter = Depends(deps.project_info_getter),
) -> FFProbeResponse:
    # Validate projectKey and obtain Project (not used further here)
    _ = project_info_getter(request.projectKey)
    if request.path.suffix != ".mp4":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only mp4 files are supported.",
        )

    result = run_ffprobe(str(request.path))

    response = FFProbeResponse.model_validate(result)

    return response


def format_bitrate(bitrate_bps: int) -> str:
    """Formats bitrate from bits per second to a human-readable string."""
    if bitrate_bps <= 0:
        return "N/A"
    for unit in ["bps", "kbps", "Mbps", "Gbps"]:
        if bitrate_bps < 1000:
            return f"{bitrate_bps:.1f} {unit}"
        bitrate_bps /= 1000
    return f"{bitrate_bps:.1f} Tbps"


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
        "format=duration,size,bit_rate,format_name:stream=avg_frame_rate,r_frame_rate,codec_name,width,height,display_aspect_ratio,color_space,color_transfer,color_primaries",
        "-of",
        "json",  # Output in JSON format
        video_path,
    ]

    # Initialize extracted_info with default/None values and an error key
    extracted_info = {
        "file_path": video_path,
        "duration": 0.0,
        "width": 0,
        "height": 0,
        "fps": 0,
        "format": "",
        "size": 0,
        "codec": "",
        "is_vfr": False,
        "bitrate_str": "N/A",
        "aspect_ratio": "",
        "color_space": "",
    }

    try:
        # Execute the ffprobe command
        process = subprocess.run(command, capture_output=True, text=True, check=True)

        # Parse the JSON output
        metadata = json.loads(process.stdout)

        # --- Extracting Data ---
        if "format" in metadata:
            fmt = metadata["format"]
            if "duration" in fmt:
                try:
                    extracted_info["duration"] = float(fmt["duration"])
                except ValueError:
                    pass
            if "size" in fmt:
                try:
                    extracted_info["size"] = int(fmt["size"])
                except ValueError:
                    pass
            if "bit_rate" in fmt:
                try:
                    extracted_info["bitrate_str"] = format_bitrate(int(fmt["bit_rate"]))
                except ValueError:
                    pass
            if "format_name" in fmt:
                extracted_info["format"] = str(fmt["format_name"])

        if "streams" in metadata and len(metadata["streams"]) > 0:
            video_stream = metadata["streams"][
                0
            ]  # Assuming we want the first video stream

            # Codec
            if "codec_name" in video_stream:
                extracted_info["codec"] = str(video_stream["codec_name"])

            # Resolution (Width and Height)
            width = video_stream.get("width")
            height = video_stream.get("height")
            if width and height:
                extracted_info["width"] = int(width)
                extracted_info["height"] = int(height)

            # Aspect Ratio
            if "display_aspect_ratio" in video_stream:
                extracted_info["aspect_ratio"] = str(video_stream["display_aspect_ratio"])

            # VFR vs CFR
            avg_fps = video_stream.get("avg_frame_rate")
            r_fps = video_stream.get("r_frame_rate")
            if avg_fps and r_fps:
                extracted_info["is_vfr"] = avg_fps != r_fps

            # Color Space / HDR
            cs = video_stream.get("color_space", "")
            ct = video_stream.get("color_transfer", "")
            cp = video_stream.get("color_primaries", "")
            color_info = [c for c in [cs, ct, cp] if c and c != "unknown"]
            extracted_info["color_space"] = " / ".join(color_info)

            # FPS
            if "avg_frame_rate" in video_stream:
                rate_str = video_stream["avg_frame_rate"]
                if "/" in rate_str:
                    try:
                        num, den = map(int, rate_str.split("/"))
                        if den != 0:  # Avoid division by zero
                            extracted_info["fps"] = round(num / den)
                    except ValueError:
                        pass
                else:
                    try:
                        extracted_info["fps"] = round(float(rate_str))
                    except ValueError:
                        pass

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
