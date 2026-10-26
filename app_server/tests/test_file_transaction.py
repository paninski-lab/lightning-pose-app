"""replace_files and write_atomic: a failure leaves the old files, never a mix."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest

from litpose_app.utils import file_transaction
from litpose_app.utils.file_transaction import (
    CommitRollbackError,
    replace_files,
    write_atomic,
)

_real_replace = os.replace


def _stage(tmp_path: Path, name: str, old: str | None, new: str) -> tuple[Path, Path]:
    target = tmp_path / name
    if old is not None:
        target.write_text(old)
    tmp = tmp_path / f"{name}.new.tmp"
    tmp.write_text(new)
    return tmp, target


def _fail_replace_onto(monkeypatch, *targets: Path) -> None:
    """Make os.replace raise when it moves a file onto one of ``targets``."""

    def replace(src, dst):
        if Path(dst) in targets:
            raise OSError(f"injected failure replacing {dst}")
        return _real_replace(src, dst)

    monkeypatch.setattr(file_transaction.os, "replace", replace)


def _leftovers(tmp_path: Path) -> list[str]:
    return sorted(
        p.name for p in tmp_path.iterdir() if p.suffix in (".tmp", ".bak")
    )


def test_replace_files_commits_every_file_and_cleans_up(tmp_path: Path):
    staged = [
        _stage(tmp_path, "a.csv", "old a", "new a"),
        _stage(tmp_path, "b.csv", None, "new b"),
    ]
    replace_files(staged)
    assert (tmp_path / "a.csv").read_text() == "new a"
    assert (tmp_path / "b.csv").read_text() == "new b"
    assert _leftovers(tmp_path) == []


def test_replace_files_first_failure_changes_nothing(tmp_path: Path, monkeypatch):
    staged = [
        _stage(tmp_path, "a.csv", "old a", "new a"),
        _stage(tmp_path, "b.csv", "old b", "new b"),
    ]
    _fail_replace_onto(monkeypatch, tmp_path / "a.csv")
    with pytest.raises(OSError, match="injected"):
        replace_files(staged)
    assert (tmp_path / "a.csv").read_text() == "old a"
    assert (tmp_path / "b.csv").read_text() == "old b"
    assert _leftovers(tmp_path) == []


def test_replace_files_later_failure_restores_earlier_files(
    tmp_path: Path, monkeypatch
):
    staged = [
        _stage(tmp_path, "a.csv", "old a", "new a"),
        _stage(tmp_path, "new.csv", None, "created"),
        _stage(tmp_path, "c.csv", "old c", "new c"),
    ]
    _fail_replace_onto(monkeypatch, tmp_path / "c.csv")
    with pytest.raises(OSError, match="injected"):
        replace_files(staged)
    assert (tmp_path / "a.csv").read_text() == "old a"
    assert not (tmp_path / "new.csv").exists()
    assert (tmp_path / "c.csv").read_text() == "old c"
    assert _leftovers(tmp_path) == []


def test_replace_files_names_files_it_could_not_restore(tmp_path: Path, monkeypatch):
    staged = [
        _stage(tmp_path, "a.csv", "old a", "new a"),
        _stage(tmp_path, "b.csv", "old b", "new b"),
    ]

    def replace(src, dst):
        # b.csv fails to commit, and restoring a.csv from its backup fails too.
        if Path(dst) == tmp_path / "b.csv" or Path(src).suffix == ".bak":
            raise OSError("injected")
        return _real_replace(src, dst)

    monkeypatch.setattr(file_transaction.os, "replace", replace)
    with pytest.raises(CommitRollbackError) as info:
        replace_files(staged)

    backup = info.value.unrestored[tmp_path / "a.csv"]
    assert backup is not None and backup.read_text() == "old a"
    assert str(tmp_path / "a.csv") in str(info.value)
    assert (tmp_path / "b.csv").read_text() == "old b"
    # Only the backup needed for recovery is kept.
    assert _leftovers(tmp_path) == [backup.name]


def test_replace_files_backup_failure_changes_nothing(tmp_path: Path, monkeypatch):
    staged = [
        _stage(tmp_path, "a.csv", "old a", "new a"),
        _stage(tmp_path, "b.csv", "old b", "new b"),
    ]
    real_copy = shutil.copy2

    def copy2(src, dst):
        if Path(src) == tmp_path / "b.csv":
            raise OSError("disk full")
        return real_copy(src, dst)

    monkeypatch.setattr(file_transaction.shutil, "copy2", copy2)
    with pytest.raises(OSError, match="disk full"):
        replace_files(staged)
    assert (tmp_path / "a.csv").read_text() == "old a"
    assert (tmp_path / "b.csv").read_text() == "old b"
    assert _leftovers(tmp_path) == []


def test_write_atomic_keeps_old_file_when_write_fails(tmp_path: Path):
    folder = tmp_path / "registry"
    folder.mkdir()
    path = folder / "projects.toml"
    path.write_text("old")

    def write(tmp: Path) -> None:
        tmp.write_text("half")
        raise RuntimeError("crash mid-write")

    with pytest.raises(RuntimeError):
        write_atomic(path, write)
    assert path.read_text() == "old"
    assert [p.name for p in folder.iterdir()] == ["projects.toml"]


def test_write_atomic_replaces_file(tmp_path: Path):
    folder = tmp_path / "registry"
    folder.mkdir()
    path = folder / "projects.toml"
    path.write_text("old")
    write_atomic(path, lambda tmp: tmp.write_text("new"))
    assert path.read_text() == "new"
    assert [p.name for p in folder.iterdir()] == ["projects.toml"]
