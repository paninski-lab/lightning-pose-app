from __future__ import annotations

from pathlib import Path
from typing import Any

from omegaconf import OmegaConf

from litpose_app.config import Config
from .project import get_project_info


def load_yaml_relative(file_path: Path, config: Config) -> dict[str, Any]:
    """Read a YAML relative to the project's data_dir and return plain dict.

    Raises FileNotFoundError if the file doesn't exist. Raises ValueError if
    parsing fails.
    """
    # Resolve project info to know the data_dir
    project_info = get_project_info(config).projectInfo
    if project_info.data_dir is None:
        raise FileNotFoundError("Active project has no data_dir configured")

    path = Path(project_info.data_dir) / file_path
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        cfg = OmegaConf.load(path)
        cfg_dict = OmegaConf.to_container(cfg, resolve=True)
        if not isinstance(cfg_dict, dict):
            # We expect a mapping at the root; enforce for API stability
            raise ValueError("YAML did not parse to a mapping/dict")
        return cfg_dict  # type: ignore[return-value]
    except FileNotFoundError:
        raise
    except Exception as e:
        raise ValueError(f"Failed to parse YAML: {e}")
