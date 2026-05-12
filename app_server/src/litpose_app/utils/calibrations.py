import csv
import re
from pathlib import Path


def update_calibrations_csv(data_dir: Path, view_names: list[str]) -> None:
    if len(view_names) <= 1:
        return
    sessions = _find_sessions(data_dir, view_names)
    labeled_frames = _find_labeled_frames(data_dir, sessions, view_names)
    _write_calibrations_csv(data_dir, labeled_frames)


def _find_sessions(data_dir: Path, view_names: list[str]) -> dict[str, list[Path]]:
    sessions: dict[str, list[Path]] = {}

    for videos_dir in sorted(data_dir.rglob("videos*")):
        if not videos_dir.is_dir():
            continue
        for mp4_file in sorted(videos_dir.glob("*.mp4")):
            stem = mp4_file.stem
            for view in view_names:
                if stem.endswith(f"_{view}"):
                    prefix = stem[: -(len(view) + 1)]
                    sessions.setdefault(prefix, []).append(mp4_file)
                    break

    return sessions


def _find_labeled_frames(
    data_dir: Path,
    sessions: dict[str, list[Path]],
    view_names: list[str],
) -> dict[str, set[str]]:
    if not view_names:
        return {}

    first_view = view_names[0]
    result: dict[str, set[str]] = {}

    for session_prefix in sorted(sessions):
        labeled_dir = data_dir / "labeled-data" / f"{session_prefix}_{first_view}"
        filenames: set[str] = set()

        if labeled_dir.is_dir():
            for img_file in labeled_dir.iterdir():
                if re.search(r"\d+$", img_file.stem):
                    filenames.add(img_file.name)

        result[session_prefix] = filenames

    return result


def _write_calibrations_csv(
    data_dir: Path,
    labeled_frames: dict[str, set[str]],
) -> None:
    csv_path = data_dir / "calibrations_appautogen.csv"

    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["", "file"])
        for session_prefix in sorted(labeled_frames):
            toml_path = data_dir / "calibrations" / f"{session_prefix}.toml"
            cal_file = f"calibrations/{session_prefix}.toml" if toml_path.exists() else "calibration.toml"
            for filename in sorted(labeled_frames[session_prefix]):
                writer.writerow([f"labeled-data/{session_prefix}/{filename}", cal_file])
