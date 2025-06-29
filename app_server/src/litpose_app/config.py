"""Routes should not access this directly, if they want to be able to
modify these in unit tests.
Instead, prefer to inject `config: deps.config into the route using FastAPI's dependency injection.
See https://fastapi.tiangolo.com/tutorial/dependencies/."""

from pathlib import Path

from pydantic import BaseModel


# Consider `pydantic_settings.BaseSettings` for potential future needs.
class Config(BaseModel):
    PROJECT_INFO_TOML_PATH: Path = Path("~/.lightning_pose/project.toml").expanduser()

    ## Video transcoding settings

    # Directory where finely transcoded videos are stored
    FINE_VIDEO_DIR: Path = Path("~/.lightning_pose/finevideos").expanduser()

    # We'll automatically transcode videos with size under this limit.
    # Larger ones will have to be manually triggered (design TBD).
    AUTO_TRANSCODE_VIDEO_SIZE_LIMIT_MB: int = 30
