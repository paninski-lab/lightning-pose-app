from pathlib import Path

import pytest

from litpose_app.utils.calibrations import (
    _find_labeled_frames,
    _find_sessions,
    _write_calibrations_csv,
    update_calibrations_csv,
)

VIEW_NAMES = ["top", "side"]


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "data"


def make_videos(data_dir: Path, rel_dir: str, filenames: list[str]) -> None:
    d = data_dir / rel_dir
    d.mkdir(parents=True, exist_ok=True)
    for name in filenames:
        (d / name).touch()


def make_labeled(data_dir: Path, session_view: str, filenames: list[str]) -> None:
    d = data_dir / "labeled-data" / session_view
    d.mkdir(parents=True, exist_ok=True)
    for name in filenames:
        (d / name).touch()


class TestFindSessions:
    def test_basic(self, data_dir: Path):
        make_videos(data_dir, "videos", ["session0_top.mp4", "session0_side.mp4"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        assert set(sessions.keys()) == {"session0"}
        assert len(sessions["session0"]) == 2

    def test_multiple_sessions(self, data_dir: Path):
        make_videos(data_dir, "videos", [
            "session0_top.mp4", "session0_side.mp4",
            "session1_top.mp4", "session1_side.mp4",
        ])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        assert set(sessions.keys()) == {"session0", "session1"}

    def test_videos_star_directories(self, data_dir: Path):
        make_videos(data_dir, "videos_cam1", ["session0_top.mp4"])
        make_videos(data_dir, "videos_cam2", ["session1_top.mp4"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        assert set(sessions.keys()) == {"session0", "session1"}

    def test_recursive(self, data_dir: Path):
        make_videos(data_dir, "subdir/videos", ["session0_top.mp4"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        assert "session0" in sessions

    def test_ignores_unknown_views(self, data_dir: Path):
        make_videos(data_dir, "videos", ["session0_unknown.mp4"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        assert sessions == {}

    def test_deterministic_order(self, data_dir: Path):
        make_videos(data_dir, "videos", ["b_top.mp4", "a_top.mp4"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        assert list(sessions.keys()) == sorted(sessions.keys())

    def test_empty(self, data_dir: Path):
        data_dir.mkdir(parents=True)
        assert _find_sessions(data_dir, VIEW_NAMES) == {}


class TestFindLabeledFrames:
    def test_basic(self, data_dir: Path):
        make_videos(data_dir, "videos", ["session0_top.mp4"])
        make_labeled(data_dir, "session0_top", ["img00000005.png", "img00000010.png"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        frames = _find_labeled_frames(data_dir, sessions, VIEW_NAMES)
        assert frames == {"session0": {"img00000005.png", "img00000010.png"}}

    def test_uses_first_view_only(self, data_dir: Path):
        make_videos(data_dir, "videos", ["session0_top.mp4"])
        make_labeled(data_dir, "session0_top", ["img00000001.png"])
        make_labeled(data_dir, "session0_side", ["img00000002.png"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        frames = _find_labeled_frames(data_dir, sessions, VIEW_NAMES)
        assert frames == {"session0": {"img00000001.png"}}

    def test_ignores_non_numeric_stems(self, data_dir: Path):
        make_videos(data_dir, "videos", ["session0_top.mp4"])
        make_labeled(data_dir, "session0_top", ["img00000005.png", "README.txt"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        frames = _find_labeled_frames(data_dir, sessions, VIEW_NAMES)
        assert frames == {"session0": {"img00000005.png"}}

    def test_missing_labeled_dir_gives_empty_set(self, data_dir: Path):
        make_videos(data_dir, "videos", ["session0_top.mp4"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        frames = _find_labeled_frames(data_dir, sessions, VIEW_NAMES)
        assert frames == {"session0": set()}

    def test_no_view_names(self, data_dir: Path):
        make_videos(data_dir, "videos", ["session0_top.mp4"])
        sessions = _find_sessions(data_dir, VIEW_NAMES)
        assert _find_labeled_frames(data_dir, sessions, []) == {}


class TestWriteCalibrationsCsv:
    def test_uses_session_toml_when_present(self, data_dir: Path):
        data_dir.mkdir(parents=True)
        cal_dir = data_dir / "calibrations"
        cal_dir.mkdir()
        (cal_dir / "session0.toml").touch()

        labeled_frames = {"session0": {"img00000005.png", "img00000010.png"}}
        _write_calibrations_csv(data_dir, labeled_frames)

        lines = (data_dir / "calibrations_appautogen.csv").read_text().splitlines()
        assert "labeled-data/session0/img00000005.png,calibrations/session0.toml" in lines
        assert "labeled-data/session0/img00000010.png,calibrations/session0.toml" in lines

    def test_falls_back_to_generic_toml_when_missing(self, data_dir: Path):
        data_dir.mkdir(parents=True)
        labeled_frames = {"session0": {"img00000005.png", "img00000010.png"}}
        _write_calibrations_csv(data_dir, labeled_frames)

        lines = (data_dir / "calibrations_appautogen.csv").read_text().splitlines()
        assert "labeled-data/session0/img00000005.png,calibration.toml" in lines
        assert "labeled-data/session0/img00000010.png,calibration.toml" in lines

    def test_mixed_sessions(self, data_dir: Path):
        data_dir.mkdir(parents=True)
        cal_dir = data_dir / "calibrations"
        cal_dir.mkdir()
        (cal_dir / "session0.toml").touch()

        labeled_frames = {
            "session0": {"img00000005.png"},
            "session1": {"img00000151.png"},
        }
        _write_calibrations_csv(data_dir, labeled_frames)

        lines = (data_dir / "calibrations_appautogen.csv").read_text().splitlines()
        assert "labeled-data/session0/img00000005.png,calibrations/session0.toml" in lines
        assert "labeled-data/session1/img00000151.png,calibration.toml" in lines

    def test_sorted_output(self, data_dir: Path):
        data_dir.mkdir(parents=True)
        labeled_frames = {"session0": {"img00000010.png", "img00000005.png"}}
        _write_calibrations_csv(data_dir, labeled_frames)

        lines = (data_dir / "calibrations_appautogen.csv").read_text().splitlines()
        assert lines[1:] == sorted(lines[1:])

    def test_empty(self, data_dir: Path):
        data_dir.mkdir(parents=True)
        _write_calibrations_csv(data_dir, {})
        lines = (data_dir / "calibrations_appautogen.csv").read_text().splitlines()
        assert lines == [",file"]


class TestUpdateCalibrationsCsv:
    def test_skips_single_view(self, data_dir: Path):
        data_dir.mkdir(parents=True)
        update_calibrations_csv(data_dir, ["top"])
        assert not (data_dir / "calibrations_appautogen.csv").exists()

    def test_end_to_end(self, data_dir: Path):
        make_videos(data_dir, "videos", ["session0_top.mp4", "session0_side.mp4"])
        make_labeled(data_dir, "session0_top", ["img00000005.png", "img00000010.png"])

        update_calibrations_csv(data_dir, VIEW_NAMES)

        csv_path = data_dir / "calibrations_appautogen.csv"
        assert csv_path.exists()
        content = csv_path.read_text()
        assert "labeled-data/session0/img00000005.png" in content
        assert "calibration.toml" in content
