"Convert legacy *.unlabeled sidecar files to *.unlabeled.jsonl"

from __future__ import annotations

import json
import os
from pathlib import Path

MIGRATION_ID = "001_unlabeled_to_jsonl"
DESCRIPTION = "Convert *.unlabeled sidecar files to *.unlabeled.jsonl"


def needs_migration(data_dir: Path) -> bool:
    # Needed if any legacy .unlabeled exists.
    return any(p.is_file() for p in data_dir.rglob("*.unlabeled"))


def migrate(data_dir: Path) -> None:
    """
    Legacy format: each line is a frame path string.
    New format: jsonl lines: {"frame_path": "...", "predictions": null}
    """
    for legacy_path in data_dir.rglob("*.unlabeled"):
        if not legacy_path.is_file():
            continue

        jsonl_path = legacy_path.with_suffix(".unlabeled.jsonl")

        # Only generate jsonl if it doesn't already exist.
        if jsonl_path.exists():
            assert False

        lines = [
            ln.strip() for ln in legacy_path.read_text().splitlines() if ln.strip()
        ]
        entries = [{"frame_path": ln, "predictions": None} for ln in lines]
        jsonl_path.write_text(
            "\n".join(json.dumps(e) for e in entries) + ("\n" if entries else "")
        )

    # Remove legacy files
    for legacy_path in data_dir.rglob("*.unlabeled"):
        os.remove(legacy_path)
