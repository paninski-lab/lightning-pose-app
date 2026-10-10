"""Which files count as project videos.

A video folder is a direct child of the data directory whose name starts with
``videos``. Playable sessions are ``*.mp4`` anywhere under those folders.
"""

from __future__ import annotations

from collections.abc import Collection, Iterator
from pathlib import Path

VIDEO_DIR_PREFIX = "videos"
PROJECT_MP4_GLOB = "videos*/**/*.mp4"


def is_project_video_dir(name: str) -> bool:
    """True when ``name`` is a data-directory folder the app treats as videos."""
    return name.startswith(VIDEO_DIR_PREFIX)


def project_video_root(
    path: Path,
    data_dir: Path,
    ignored: Collection[str] | None = None,
) -> Path | None:
    """Return the ``videos*`` directory that contains ``path``, or None.

    ``path`` may be absolute or relative to ``data_dir``. The ``videos*`` folder
    must be a direct child of ``data_dir``, and ``path`` must be a file inside it.
    Folders named in ``ignored`` are treated as absent.
    """
    data = data_dir.resolve()
    candidate = path if path.is_absolute() else data / path
    try:
        rel = candidate.resolve().relative_to(data)
    except (ValueError, OSError):
        return None
    if len(rel.parts) < 2 or not is_project_video_dir(rel.parts[0]):
        return None
    if rel.parts[0] in set(ignored or ()):
        return None
    return data / rel.parts[0]


def iter_project_mp4s(
    data_dir: Path, ignored: Collection[str] | None = None
) -> Iterator[Path]:
    """Yield mp4 paths under any ``videos*`` folder of ``data_dir``.

    Folders named in ``ignored`` are skipped. The directories are not removed.
    """
    if not data_dir.is_dir():
        return
    skip = set(ignored or ())
    for path in data_dir.glob(PROJECT_MP4_GLOB):
        if path.relative_to(data_dir).parts[0] in skip:
            continue
        yield path
