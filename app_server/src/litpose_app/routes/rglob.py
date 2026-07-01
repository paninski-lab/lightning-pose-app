"""RPC endpoint for glob-style filesystem listing with optional file metadata."""

from __future__ import annotations

import datetime
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel
from wcmatch import pathlib as w

router = APIRouter()


class RGlobRequest(BaseModel):
    """Parameters for a recursive glob over a base directory."""

    baseDir: Path
    pattern: str
    noDirs: bool = False
    stat: bool = False


class RGlobResponseEntry(BaseModel):
    """Metadata for one entry returned by the rglob endpoint."""

    path: Path

    # Present only if request had stat=True or noDirs=True
    type: str | None

    # Present only if request had stat=True

    size: int | None
    # Creation timestamp, ISO format.
    cTime: str | None
    # Modified timestamp, ISO format.
    mTime: str | None


class RGlobResponse(BaseModel):
    """Result of an rglob call: a list of entries relative to the base directory."""

    entries: list[RGlobResponseEntry]
    relativeTo: Path  # this is going to be the same base_dir that was in the request.


@router.post("/app/v0/rpc/rglob")
def rglob(request: RGlobRequest) -> RGlobResponse:
    """Recursively glob base_dir with the given pattern and return sorted entries."""
    response = RGlobResponse(entries=[], relativeTo=request.baseDir)

    results = _rglob(
        str(request.baseDir),
        pattern=request.pattern,
        no_dirs=request.noDirs,
        stat=request.stat,
    )
    for r in sorted(results, key=lambda e: str(e["path"]).lower()):
        # Convert dict to pydantic model
        converted = RGlobResponseEntry.model_validate(r)
        response.entries.append(converted)

    return response


def _rglob(
    base_path: str,
    pattern: str | None = None,
    no_dirs: bool = False,
    stat: bool = False,
) -> list[dict]:
    """
    Needs to be performant when searching over large model directory.
    Uses wcmatch to exclude directories with extra calls to Path.is_dir.
    wcmatch includes features that may be helpful down the line.
    """
    if pattern is None:
        pattern = "**/*"
    flags = w.GLOBSTAR
    if no_dirs:
        flags |= w.NODIR
    results = w.Path(base_path).glob(
        pattern,
        flags=flags,
    )
    result_dicts = []
    for r in results:
        stat_info = r.stat() if stat else None
        is_dir = False if no_dirs else r.is_dir() if stat else None
        if no_dirs and is_dir:
            continue
        entry_relative_path = r.relative_to(base_path)
        d = {
            "path": entry_relative_path,
            "type": "dir" if is_dir else "file" if is_dir == False else None,  # noqa: E712
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
