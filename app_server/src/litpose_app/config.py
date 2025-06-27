from pathlib import Path

PROJECT_INFO_TOML_PATH = Path("~/.lightning_pose/project.toml").expanduser()

## Video transcoding settings

# Directory where finely transcoded videos are stored
FINE_VIDEO_DIR = Path("~/.lightning_pose/finevideos").expanduser()

# We'll automatically transcode videos with size under this limit.
# Larger ones will have to be manually triggered (design TBD).
AUTO_TRANSCODE_VIDEO_SIZE_LIMIT_MB = 30
