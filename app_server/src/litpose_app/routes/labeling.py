import os
from pathlib import Path

from fastapi import APIRouter, Depends

from litpose_app import deps
from litpose_app.routes.project import ProjectInfo


class FileToWrite:
    filename: str
    contents: str


class WriteMultifileRequest:
    views: list[FileToWrite]


router = APIRouter()


@router.post("/app/v0/rpc/writeMultifile")
def write_multifile(
    request: WriteMultifileRequest,
    project_info: ProjectInfo = Depends(deps.project_info),
):
    # Security
    for view in request.views:
        p = Path(view.filename).resolve()  # crucial to resolve ".."
        if not p.is_relative_to(project_info.data_dir):
            raise AssertionError("Invalid filename")
        if p.suffix not in (".csv", ".unlabeled"):
            raise AssertionError("Invalid suffix")

    # Write all files to tmpfile to ensure they all successfully write.
    for view in request.views:
        tmpfile = view.filename + ".lptmp"
        with open(tmpfile, "w") as f:
            f.write(view.contents)

    # Rename is atomic. Partial failure is highly unlikely since all writes above succeeded.
    # In case of partial failure, the remaining tmpfiles created above aid investigation.
    for view in request.views:
        tmpfile = view.filename + ".lptmp"
        os.rename(tmpfile, view.filename)

    return "ok"
