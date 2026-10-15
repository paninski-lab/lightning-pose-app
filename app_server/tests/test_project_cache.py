"""Freshness rules for .project-cache."""

import os
from pathlib import Path

from litpose_app.project_cache import (
    CACHE_DIR_NAME,
    identity_matches,
    sample_sha256,
    sha256_file,
)


def _fractional(path: Path) -> os.stat_result:
    st = path.stat()
    if st.st_mtime_ns % 1_000_000_000 == 0:
        bumped = st.st_mtime_ns + 1
        os.utime(path, ns=(bumped, bumped))
    return path.stat()


def test_fractional_mtime_matches_without_reading_the_hash(tmp_path):
    """A sub-second timestamp is trusted from size and mtime alone."""
    path = tmp_path / "notes.csv"
    path.write_text("hello")
    st = _fractional(path)
    assert identity_matches(path, size=st.st_size, mtime_ns=st.st_mtime_ns, digest="not-a-hash")


def test_size_change_does_not_match(tmp_path):
    path = tmp_path / "notes.csv"
    path.write_text("hello")
    st = _fractional(path)
    path.write_text("hello!")
    assert not identity_matches(path, size=st.st_size, mtime_ns=st.st_mtime_ns, digest="x")


def test_whole_second_mtime_requires_the_hash(tmp_path):
    """A one-second timestamp can be copied unchanged, so the hash decides."""
    path = tmp_path / "notes.csv"
    path.write_bytes(b"hello")
    digest = sha256_file(path)
    st = path.stat()
    coarse = st.st_mtime_ns - (st.st_mtime_ns % 1_000_000_000)
    os.utime(path, ns=(coarse, coarse))
    st = path.stat()
    assert identity_matches(path, size=st.st_size, mtime_ns=st.st_mtime_ns, digest=digest)
    path.write_bytes(b"world")
    os.utime(path, ns=(coarse, coarse))
    assert not identity_matches(path, size=st.st_size, mtime_ns=coarse, digest=digest)


def test_video_sample_hash_changes_when_the_ends_change(tmp_path):
    path = tmp_path / "clip.mp4"
    path.write_bytes(b"a" * 16)
    first = sample_sha256(path)
    path.write_bytes(b"b" * 16)
    assert sample_sha256(path) != first


def test_symlink_cache_dir_is_not_written(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (data / CACHE_DIR_NAME).symlink_to(outside, target_is_directory=True)
    from litpose_app.project_cache import replace_file_checks

    replace_file_checks(data, "labels", {"CollectedData.csv": {"kind": "file"}})
    assert list(outside.iterdir()) == []
