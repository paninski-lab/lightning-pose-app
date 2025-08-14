from pathlib import Path
import logging
import shutil
import subprocess


logger = logging.getLogger("apscheduler")


def transcode_video_task(input_file_path: Path, output_file_path: Path):
    transcode_file(input_file_path, output_file_path)


# --- Configuration ---
# FFmpeg options for transcoding:
# -g 1: Intra frame for every frame (Group of Pictures size 1)
# -c:v libx264: Use libx264 encoder
# -preset medium: A balance between encoding speed and compression.
#                 Options: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow.
# -crf 23: Constant Rate Factor. Lower values mean better quality and larger files (0-51, default 23).
# -c:a copy: Copy audio stream without re-encoding. If audio re-encoding is needed, change this.
# -y: Overwrite output files without asking.
FFMPEG_OPTIONS = [
    "-c:v",
    "libx264",
    "-g",
    "1",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-c:a",
    "copy",
]


def check_dependencies():
    """Checks if ffmpeg and ffprobe are installed and in PATH."""
    if shutil.which("ffmpeg") is None:
        logger.error("ffmpeg is not installed or not found in PATH.")
        return False
    if shutil.which("ffprobe") is None:
        logger.error("ffprobe is not installed or not found in PATH.")
        return False
    return True


def transcode_file(
    input_file_path: Path,
    output_file_path: Path,
) -> tuple[bool, str, Path | None]:
    """
    Transcodes a single video file to have an intra frame for every frame.
    The output file will be named by inserting ".fine" before the final ".mp4"
    and placed in the specified output_dir.
    Example: "video.sec.mp4" -> "video.sec.fine.mp4"
    Returns a tuple: (success_status: bool, message: str, output_path: Path | None)
    """
    try:

        if output_file_path.exists():
            logger.debug(
                f"Output file '{output_file_path.name}' already exists. Skipping transcoding."
            )
            return True, f"Skipped (exists): {output_file_path.name}", output_file_path

        logger.debug(f"Processing: {input_file_path.name} -> {output_file_path.name}")
        output_file_path.parent.mkdir(parents=True, exist_ok=True)
        ffmpeg_cmd = [
            "ffmpeg",
            "-i",
            str(input_file_path),
            *FFMPEG_OPTIONS,
            "-y",  # Overwrite output without asking (though we check existence above)
            str(output_file_path),
        ]

        process = subprocess.Popen(
            ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )

        stdout, stderr = process.communicate()

        if process.returncode == 0:
            logger.info(f"Successfully transcoded: {output_file_path.name}")
            return True, f"Success: {output_file_path.name}", output_file_path
        else:
            logger.error(f"Error transcoding '{input_file_path.name}':")
            logger.error(f"FFmpeg stdout:\n{stdout}")
            logger.error(f"FFmpeg stderr:\n{stderr}")
            # Clean up partially created file on error
            if output_file_path.exists():
                try:
                    output_file_path.unlink()
                except OSError as e:
                    logger.error(
                        f"Could not remove partially created file '{output_file_path}': {e}"
                    )
            return (
                False,
                f"Error: {input_file_path.name} - FFmpeg failed (code {process.returncode})",
                None,
            )

    except Exception as e:
        logger.error(f"Error processing '{input_file_path.name}': {e}")
        return False, f"Error: {input_file_path.name} - Exception: {e}", None
