"""videos* folders the running app skips.

The lists live in this process. Restarting the app checks every folder again.
Nothing is written to projects.toml, and nothing is deleted from disk.
"""

from __future__ import annotations

_by_project: dict[str, list[str]] = {}


def ignored_video_dirs(project_key: str) -> list[str]:
    """Folder names this process is skipping for project_key."""
    return list(_by_project.get(project_key, []))


def remember_ignored_video_dirs(project_key: str, names: list[str]) -> None:
    """Replace the skipped folders for project_key. An empty list checks them all."""
    _by_project[project_key] = list(names)
