from __future__ import annotations

from pathlib import Path
import datetime
from typing import Any

from wcmatch import pathlib as w

from .models import (
    RGlobRequest,
    RGlobResponse,
    RGlobResponseEntry,
)


def rglob(base_dir: Path, pattern: str, no_dirs: bool = False, do_stat: bool = False) -> RGlobResponse:
    """Business logic for the rglob endpoint.

    Performs a restricted recursive glob starting at `base_dir` using wcmatch.

    Security: only allows patterns ending with .csv, .mp4, or .toml
    (same behavior as the legacy FastAPI route). If not allowed, raises
    ValueError which the Flask layer should translate to HTTP 403.
    """
    if not (
        pattern.endswith(".csv") or pattern.endswith(".mp4") or pattern.endswith(".toml")
    ):
        raise ValueError("Only csv, mp4, toml files are supported.")

    results = _rglob(str(base_dir), pattern=pattern, no_dirs=no_dirs, stat=do_stat)

    response = RGlobResponse(entries=[], relativeTo=base_dir)
    for r in results:
        entry = RGlobResponseEntry.model_validate(r)
        response.entries.append(entry)
    return response


def _rglob(base_path: str, pattern: str | None = None, no_dirs: bool = False, stat: bool = False) -> list[dict[str, Any]]:
    """Efficient recursive glob using wcmatch.

    - `no_dirs`: exclude directories from results.
    - `stat`: include file stats (size, cTime, mTime).
    """
    if pattern is None:
        pattern = "**/*"

    flags = w.GLOBSTAR
    if no_dirs:
        flags |= w.NODIR

    results = w.Path(base_path).glob(pattern, flags=flags)

    result_dicts: list[dict[str, Any]] = []
    for r in results:
        stat_info = r.stat() if stat else None
        is_dir = False if no_dirs else r.is_dir() if stat else None
        if no_dirs and is_dir:
            continue
        entry_relative_path = r.relative_to(base_path)
        d: dict[str, Any] = {
            "path": entry_relative_path,
            "type": "dir" if is_dir else "file" if is_dir is False else None,
            "size": stat_info.st_size if stat_info else None,
            # Note: st_birthtime is more reliable for creation time on some systems
            "cTime": (
                datetime.datetime.fromtimestamp(
                    getattr(stat_info, "st_birthtime", stat_info.st_ctime)
                ).isoformat()
                if stat_info
                else None
            ),
            "mTime": (
                datetime.datetime.fromtimestamp(stat_info.st_mtime).isoformat()
                if stat_info
                else None
            ),
        }
        result_dicts.append(d)

    return result_dicts
