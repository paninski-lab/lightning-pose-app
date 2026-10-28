"""Where calibration files live in a project's data directory.

LP looks for ``calibrations/<session>.toml`` and falls back to
``calibration.toml`` (``lightning_pose/data/datasets.py``). Bundle adjustment
backs up a session calibration it replaces into ``calibrations/backups/``.
Every route that reads, writes, lists or renames calibrations uses these
functions, so the layout is written once.
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

CALIBRATIONS_DIR = "calibrations"
PROJECT_CALIBRATION_FILE = "calibration.toml"
BACKUPS_DIR = "backups"
# A backup is <session>.<YYYYmmdd-HHMMSS>.toml. A dot, not "_", so the name
# doesn't look like a <session>_<view> name. Older backups are <session>_og-<stamp>.toml.
BACKUP_STAMP_FORMAT = "%Y%m%d-%H%M%S"

_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


def session_calibration_path(data_dir: Path, session: str) -> Path:
    """``calibrations/<session>.toml``."""
    return data_dir / CALIBRATIONS_DIR / f"{session}.toml"


def project_calibration_path(data_dir: Path) -> Path:
    """``calibration.toml``, used for sessions without their own file."""
    return data_dir / PROJECT_CALIBRATION_FILE


def calibration_backup_path(data_dir: Path, session: str, when: datetime) -> Path:
    """``calibrations/backups/<session>.<YYYYmmdd-HHMMSS>.toml``."""
    stamp = when.strftime(BACKUP_STAMP_FORMAT)
    return data_dir / CALIBRATIONS_DIR / BACKUPS_DIR / f"{session}.{stamp}.toml"


def session_calibration_files(data_dir: Path) -> list[Path]:
    """Session calibrations on disk, sorted by name ignoring case.

    Only ``.toml`` files directly in ``calibrations/``; ``backups/`` is not included.
    """
    folder = data_dir / CALIBRATIONS_DIR
    if not folder.is_dir():
        return []
    return [
        child
        for child in sorted(folder.iterdir(), key=lambda p: p.name.lower())
        if child.is_file() and child.suffix == ".toml"
    ]


def is_session_calibration(data_dir: Path, path: Path) -> bool:
    """Whether ``path`` is a file directly in ``data_dir/calibrations/``."""
    return path.parent == data_dir / CALIBRATIONS_DIR and path.is_file()


def session_calibration_filename_issue(filename: str) -> str | None:
    """Why ``filename`` can't name a session calibration, or None.

    The stem is the session id: letters, digits and ``. _ -``.
    """
    name = filename.strip()
    if (
        not name
        or name in {".", ".."}
        or "/" in name
        or "\\" in name
        or Path(name).suffix.lower() != ".toml"
    ):
        return "Enter a session filename ending in .toml."
    stem = Path(name).stem
    if not stem or not _SESSION_ID_RE.fullmatch(stem):
        return "Session id may use letters, digits, and . _ -."
    return None
