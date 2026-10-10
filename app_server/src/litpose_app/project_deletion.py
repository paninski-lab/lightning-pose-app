"""Fail-closed checks before a project directory is deleted or registered."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import HTTPException, status


def _resolved(path: Path) -> Path:
    if str(path).strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A project path is empty.",
        )
    resolved = path.expanduser().resolve()
    if not resolved.is_absolute():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot use {path}: the path is not absolute.",
        )
    return resolved


def _contains(directory: Path, descendant: Path) -> bool:
    """True when descendant is directory or a path inside it."""
    try:
        descendant.relative_to(directory)
    except ValueError:
        return False
    return True


def reject_forbidden_root(
    path: Path,
    *,
    home: Path,
    cwd: Path,
    lp_system_dir: Path,
    must_not_contain: Path | None = None,
) -> Path:
    """Return path resolved, or 400 if it must not be deleted or registered.

    Refuses a path that equals or contains home, the server working directory,
    or the app system directory. When must_not_contain is set, also refuses a
    strict ancestor of that path (a model directory that holds the data directory).
    """
    resolved = _resolved(path)
    for protected in (
        _resolved(home),
        _resolved(cwd),
        _resolved(lp_system_dir),
    ):
        if _contains(resolved, protected):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot use {resolved}: it contains a protected directory.",
            )
    if must_not_contain is not None:
        other = _resolved(must_not_contain)
        if resolved != other and _contains(resolved, other):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot use {resolved}: it contains the project data directory."
                ),
            )
    return resolved


def reject_forbidden_project_paths(
    data_dir: Path,
    model_dir: Path,
    *,
    lp_system_dir: Path,
    home: Path | None = None,
    cwd: Path | None = None,
) -> None:
    """Refuse create, register, or path updates that point at a protected root."""
    home = Path.home() if home is None else home
    cwd = Path.cwd() if cwd is None else cwd
    reject_forbidden_root(
        data_dir, home=home, cwd=cwd, lp_system_dir=lp_system_dir
    )
    reject_forbidden_root(
        model_dir,
        home=home,
        cwd=cwd,
        lp_system_dir=lp_system_dir,
        must_not_contain=data_dir,
    )


def _reject_if_contains_registered(directory: Path, other_registered: list[Path]) -> None:
    for other in other_registered:
        if _contains(directory, other.expanduser().resolve()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot delete {directory}: it contains another registered project."
                ),
            )


def _directory_contains_project_yaml(directory: Path) -> bool:
    for _root, _dirs, files in os.walk(directory):
        if "project.yaml" in files:
            return True
    return False


def paths_to_delete(
    data_dir: Path,
    model_dir: Path,
    *,
    other_registered: list[Path],
    lp_system_dir: Path,
    home: Path | None = None,
    cwd: Path | None = None,
) -> list[Path]:
    """Return resolved directories to remove, or 400 if deletion is unsafe.

    When the model directory is inside the data directory, only the data
    directory is returned. An external model directory is returned only when
    it exists, holds no project.yaml, and holds no other registered project.
    """
    home = Path.home() if home is None else home
    cwd = Path.cwd() if cwd is None else cwd
    data = reject_forbidden_root(
        data_dir, home=home, cwd=cwd, lp_system_dir=lp_system_dir
    )
    model = reject_forbidden_root(
        model_dir,
        home=home,
        cwd=cwd,
        lp_system_dir=lp_system_dir,
        must_not_contain=data,
    )
    if not data.is_dir() or not (data / "project.yaml").is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete {data}: project.yaml was not found in the data directory."
            ),
        )
    _reject_if_contains_registered(data, other_registered)
    if _contains(data, model):
        return [data]
    if not model.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete {model}: the model directory does not exist.",
        )
    if _directory_contains_project_yaml(model):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete {model}: it contains a project.yaml file.",
        )
    _reject_if_contains_registered(model, other_registered)
    return [data, model]
