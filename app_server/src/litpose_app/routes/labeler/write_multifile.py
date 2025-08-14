import asyncio
from pathlib import Path

import aiofiles
import aiofiles.os
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app import deps
from litpose_app.routes.project import ProjectInfo


class FileToWrite(BaseModel):
    filename: str
    contents: str


class WriteMultifileRequest(BaseModel):
    views: list[FileToWrite]


router = APIRouter()


@router.post("/app/v0/rpc/writeMultifile")
async def write_multifile(
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
    write_tasks = []
    for view in request.views:
        tmpfile = view.filename + f".lptmp"

        async def write_file_task(filename, contents):
            async with aiofiles.open(filename, mode="w") as f:
                await f.write(contents)

        write_tasks.append(write_file_task(tmpfile, view.contents))

    await asyncio.gather(*write_tasks)

    # Rename is atomic. Partial failure is highly unlikely since all writes above succeeded.
    # In case of partial failure, the remaining tmpfiles created above aid investigation.
    rename_tasks = []
    for view in request.views:
        tmpfile = view.filename + ".lptmp"
        rename_tasks.append(aiofiles.os.rename(tmpfile, view.filename))

    await asyncio.gather(*rename_tasks)

    return "ok"
