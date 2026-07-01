"""
Starlette's FileResponse does not automatically return 304 if the file hasn't changed.
Starlette's StaticFiles() does, but requires a specific directory to serve files out of.

This module takes some of the logic from StaticFiles() that supports 304 if unchanged, to
implement static file serving without the directory restriction of StaticFiles().
"""

from __future__ import annotations

import os
from email.utils import parsedate
from pathlib import Path

from starlette import status
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import FileResponse, Response
from starlette.staticfiles import NotModifiedResponse


def file_response(request: Request, path: Path, **kwargs) -> Response:
    """Return a FileResponse for path, sending 304 Not Modified when the client's cache is fresh."""
    # Follow symlinks
    path = path.resolve()

    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    stat_result = os.stat(path)

    response = FileResponse(path, stat_result=stat_result, **kwargs)
    if _is_not_modified(response.headers, request.headers):
        return NotModifiedResponse(response.headers)
    return response


def _is_not_modified(response_headers: Headers, request_headers: Headers) -> bool:
    """
    Given the request and response headers, return `True` if an HTTP
    "Not Modified" response could be returned instead.

    Copied exactly from StaticFiles.is_not_modified()
    """

    try:
        if_none_match = request_headers["if-none-match"]
        etag = response_headers["etag"]
        if etag in [tag.strip(" W/") for tag in if_none_match.split(",")]:
            return True
    except KeyError:
        pass

    try:
        if_modified_since = parsedate(request_headers["if-modified-since"])
        last_modified = parsedate(response_headers["last-modified"])
        if (
            if_modified_since is not None
            and last_modified is not None
            and if_modified_since >= last_modified
        ):
            return True
    except KeyError:
        pass

    return False
