from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings


class RootConfig(BaseSettings):
    """System config for lightning-pose. Defines paths for accessing config files."""

    LP_SYSTEM_DIR: Path = Path.home() / ".lightning-pose"

    PROJECTS_TOML_PATH: Path = Field(
        default_factory=lambda data: data["LP_SYSTEM_DIR"] / "projects.toml"
    )
    UPLOADS_DIR: Path = Field(
        default_factory=lambda data: data["LP_SYSTEM_DIR"] / "uploads"
    )

    UMAMI_ANALYTICS_TAG: str = (
        '<script defer src="https://cloud.umami.is/script.js" '
        'data-website-id="ba9731f2-f746-4c4e-8fc6-d876e1556a6e"></script>'
    )

    @model_validator(mode="after")
    def init_dirs_and_files(self):
        """Creates directories as needed on application startup"""
        # Create system directory if needed
        self.LP_SYSTEM_DIR.mkdir(exist_ok=True)

        # Create blank projects.toml if it doesn't exist
        if not self.PROJECTS_TOML_PATH.is_file():
            self.PROJECTS_TOML_PATH.touch(exist_ok=True)

        if not self.UPLOADS_DIR.is_dir():
            self.UPLOADS_DIR.mkdir(exist_ok=True)
        return self
