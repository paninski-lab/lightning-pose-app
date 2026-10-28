"""Calibration file locations: session files, the project file, backups, the session id rule."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from litpose_app.calibration_paths import (
    calibration_backup_path,
    is_session_calibration,
    project_calibration_path,
    session_calibration_filename_issue,
    session_calibration_files,
    session_calibration_path,
)


def test_paths(tmp_path: Path):
    assert session_calibration_path(tmp_path, "mouse1") == tmp_path / "calibrations/mouse1.toml"
    assert project_calibration_path(tmp_path) == tmp_path / "calibration.toml"
    # The name bundle adjustment has always written.
    assert calibration_backup_path(
        tmp_path, "mouse1", datetime(2026, 10, 28, 10, 15, 0)
    ) == tmp_path / "calibrations/backups/mouse1_og-20261028-101500.toml"


def test_session_files_skip_backups_and_other_files(tmp_path: Path):
    assert session_calibration_files(tmp_path) == []
    (tmp_path / "calibrations" / "backups").mkdir(parents=True)
    for name in ("b.toml", "A.toml", "notes.txt", "backups/a_og-20261028-101500.toml"):
        (tmp_path / "calibrations" / name).write_text("")
    assert session_calibration_files(tmp_path) == [
        tmp_path / "calibrations/A.toml",
        tmp_path / "calibrations/b.toml",
    ]
    assert is_session_calibration(tmp_path, tmp_path / "calibrations/A.toml")
    assert not is_session_calibration(
        tmp_path, tmp_path / "calibrations/backups/a_og-20261028-101500.toml"
    )
    assert not is_session_calibration(tmp_path, tmp_path / "calibrations/missing.toml")


@pytest.mark.parametrize(
    ("filename", "issue"),
    [
        ("mouse1.toml", None),
        ("mouse1.day-2_a.TOML", None),
        ("mouse 1.toml", "Session id may use letters, digits, and . _ -."),
        ("mouse1.txt", "Enter a session filename ending in .toml."),
        ("sub/mouse1.toml", "Enter a session filename ending in .toml."),
    ],
)
def test_session_id_rule(filename, issue):
    assert session_calibration_filename_issue(filename) == issue
