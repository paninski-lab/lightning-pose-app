"""Unit tests for the project-deletion guard. Paths stay under tmp_path."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException

from litpose_app.project_deletion import paths_to_delete


def _roots(tmp_path: Path) -> tuple[Path, Path, Path]:
    home = tmp_path / "home"
    cwd = tmp_path / "cwd"
    system = tmp_path / "system"
    for path in (home, cwd, system):
        path.mkdir()
    return home, cwd, system


def _project(parent: Path, name: str = "demo") -> tuple[Path, Path]:
    data = parent / name
    data.mkdir(parents=True)
    (data / "project.yaml").write_text("schema_version: 1\n")
    models = data / "models"
    models.mkdir()
    return data, models


def test_allows_project_and_deletes_nested_model_dir_once(tmp_path: Path):
    home, cwd, system = _roots(tmp_path)
    data, models = _project(tmp_path)
    assert paths_to_delete(
        data,
        models,
        other_registered=[],
        home=home,
        cwd=cwd,
        lp_system_dir=system,
    ) == [data.resolve()]


def test_rejects_path_equal_to_home(tmp_path: Path):
    home, cwd, system = _roots(tmp_path)
    (home / "project.yaml").write_text("schema_version: 1\n")
    with pytest.raises(HTTPException) as exc:
        paths_to_delete(
            home,
            home / "models",
            other_registered=[],
            home=home,
            cwd=cwd,
            lp_system_dir=system,
        )
    assert exc.value.status_code == 400
    assert "protected" in exc.value.detail


def test_rejects_path_equal_to_cwd(tmp_path: Path):
    home, cwd, system = _roots(tmp_path)
    (cwd / "project.yaml").write_text("schema_version: 1\n")
    with pytest.raises(HTTPException) as exc:
        paths_to_delete(
            cwd,
            cwd / "models",
            other_registered=[],
            home=home,
            cwd=cwd,
            lp_system_dir=system,
        )
    assert exc.value.status_code == 400
    assert "protected" in exc.value.detail


def test_rejects_parent_of_cwd(tmp_path: Path):
    home, _cwd, system = _roots(tmp_path)
    studio = tmp_path / "studio"
    app = studio / "app"
    app.mkdir(parents=True)
    (studio / "project.yaml").write_text("schema_version: 1\n")
    with pytest.raises(HTTPException) as exc:
        paths_to_delete(
            studio,
            studio / "models",
            other_registered=[],
            home=home,
            cwd=app,
            lp_system_dir=system,
        )
    assert exc.value.status_code == 400
    assert "protected" in exc.value.detail


def test_rejects_external_model_dir_that_contains_another_project(tmp_path: Path):
    home, cwd, system = _roots(tmp_path)
    data, _models = _project(tmp_path, "ok")
    bucket = tmp_path / "bucket"
    other_models = bucket / "other_models"
    other_models.mkdir(parents=True)
    with pytest.raises(HTTPException) as exc:
        paths_to_delete(
            data,
            bucket,
            other_registered=[other_models],
            home=home,
            cwd=cwd,
            lp_system_dir=system,
        )
    assert exc.value.status_code == 400
    assert "another registered project" in exc.value.detail
