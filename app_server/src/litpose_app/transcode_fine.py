import shutil
import subprocess
from multiprocessing import Pool, cpu_count
from pathlib import Path

# --- Configuration ---
TARGET_SUFFIX = "sec.mp4"
OUTPUT_SUFFIX_ADDITION = ".fine"
MAX_CONCURRENCY = 6
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
        print("Error: ffmpeg is not installed or not found in PATH.")
        return False
    if shutil.which("ffprobe") is None:
        print("Error: ffprobe is not installed or not found in PATH.")
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
            print(
                f"Output file '{output_file_path.name}' already exists. Skipping transcoding."
            )
            return True, f"Skipped (exists): {output_file_path.name}", output_file_path

        print(f"Processing: {input_file_path.name} -> {output_file_path.name}")
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
            print(f"Successfully transcoded: {output_file_path.name}")
            return True, f"Success: {output_file_path.name}", output_file_path
        else:
            print(f"Error transcoding '{input_file_path.name}':")
            print(f"FFmpeg stdout:\n{stdout}")
            print(f"FFmpeg stderr:\n{stderr}")
            # Clean up partially created file on error
            if output_file_path.exists():
                try:
                    output_file_path.unlink()
                except OSError as e:
                    print(
                        f"Could not remove partially created file '{output_file_path}': {e}"
                    )
            return (
                False,
                f"Error: {input_file_path.name} - FFmpeg failed (code {process.returncode})",
                None,
            )

    except Exception as e:
        print(f"Error processing '{input_file_path.name}': {e}")
        return False, f"Error: {input_file_path.name} - Exception: {e}", None


def main():
    """
    Main function to find and transcode videos.
    """
    if not check_dependencies():
        return

    script_dir = Path(__file__).parent  # Process files in the script's directory
    # To process files in the current working directory instead:
    # current_dir = Path.cwd()

    print(
        f"Scanning for '*{TARGET_SUFFIX}' H.264 files in '{script_dir}' and its subdirectories..."
    )

    # Find all files ending with TARGET_SUFFIX recursively
    files_to_check = list(script_dir.rglob(f"*{TARGET_SUFFIX}"))

    if not files_to_check:
        print(f"No files found ending with '{TARGET_SUFFIX}'.")
        return

    print(f"Found {len(files_to_check)} potential files. Checking H.264 codec...")

    valid_files_to_transcode = []
    for f_path in files_to_check:
        # Ensure it's not an already processed file
        if OUTPUT_SUFFIX_ADDITION + ".mp4" in f_path.name:
            continue
        valid_files_to_transcode.append(f_path)

    if not valid_files_to_transcode:
        print("No H.264 files matching the criteria need transcoding.")
        return

    print(f"\nFound {len(valid_files_to_transcode)} H.264 files to transcode:")
    for f in valid_files_to_transcode:
        print(f"  - {f.name}")

    # Determine number of processes
    num_processes = min(MAX_CONCURRENCY, cpu_count(), len(valid_files_to_transcode))
    print(f"\nStarting transcoding with up to {num_processes} parallel processes...\n")

    output_file_paths = []
    for f in valid_files_to_transcode:
        base_name = f.name[: -len(TARGET_SUFFIX)]
        output_file_name = f"{base_name}{TARGET_SUFFIX.replace('.mp4', '')}{OUTPUT_SUFFIX_ADDITION}.mp4"
        output_file_path = f.parent / output_file_name
        output_file_paths.append(output_file_path)
    # In this main function, output_dir is still the parent of the input file
    # For RPC, we will specify FINE_VIDEO_DIR as output_dir
    with Pool(processes=num_processes) as pool:
        # A dummy output_dir for the script's main function; not used by RPC.
        # It ensures compatibility if this script were run standalone.
        # In the RPC, we'll pass FINE_VIDEO_DIR explicitly.
        results = pool.starmap(
            transcode_file,
            [(f, of) for f, of in zip(valid_files_to_transcode, output_file_paths)],
        )

    print("\n--- Transcoding Summary ---")
    for result in results:
        print(result)
    print("--------------------------")
    print("All tasks completed.")


if __name__ == "__main__":
    main()
