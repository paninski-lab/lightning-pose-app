"""Inference groups videos into sessions by the view after the last ``_``."""

from __future__ import annotations

from pathlib import Path

from litpose_app.routes.inference import _derive_sessions, _session_to_videos


def _touch(data_dir: Path, *names: str) -> None:
    videos = data_dir / "videos"
    videos.mkdir(parents=True, exist_ok=True)
    for name in names:
        (videos / name).write_bytes(b"")


def test_sessions_with_a_view_inside_another_view(tmp_path: Path):
    names = ["trial_cam1.mp4", "trial_cam10.mp4"]
    _touch(tmp_path, *names)
    assert _derive_sessions([Path(n) for n in names], ["cam1", "cam10"]) == ["trial"]
    groups = _session_to_videos(tmp_path, ["cam1", "cam10"])
    assert {s: sorted(p.name for p in v) for s, v in groups.items()} == {
        "trial": names
    }


def test_sessions_with_a_view_inside_the_session_name(tmp_path: Path):
    names = ["stop_side.mp4", "stop_top.mp4"]
    _touch(tmp_path, *names)
    groups = _session_to_videos(tmp_path, ["top", "side"])
    assert {s: sorted(p.name for p in v) for s, v in groups.items()} == {
        "stop": names
    }


def test_unknown_view_is_its_own_session(tmp_path: Path):
    _touch(tmp_path, "mouse1_top.mp4", "mouse1_back.mp4")
    groups = _session_to_videos(tmp_path, ["top", "side"])
    assert sorted(groups) == ["mouse1", "mouse1_back"]
