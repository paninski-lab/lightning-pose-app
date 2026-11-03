#!/usr/bin/env python
"""Print LP's recommended training settings for one label file, as JSON on the last stdout line.

Runs ``lightning_pose.utils.recommender`` (``litpose recommend``) on the label
file the Create Model dialog chose, instead of the ``CollectedData`` files LP
finds by itself. Run as a separate process because reading the GPU starts CUDA,
which would otherwise keep GPU memory in the app server.

Usage:
    python recommend_config.py --csv <view 1 csv> [<view 2 csv> ...] \
        [--views top bot] [--video_dir <data_dir>/videos] [--top_down_freely_moving]
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from pathlib import Path


def main() -> None:
    """Parse arguments, run LP's recommender and print the result as JSON."""
    parser = argparse.ArgumentParser(description="Recommend LP training settings")
    parser.add_argument("--csv", nargs="+", required=True, help="Label CSVs, one per view")
    parser.add_argument("--views", nargs="*", default=[], help="View names, in CSV order")
    parser.add_argument("--video_dir", default=None, help="Folder of unlabeled videos")
    parser.add_argument("--top_down_freely_moving", action="store_true", default=False)
    args = parser.parse_args()

    try:
        from lightning_pose.utils import recommender
    except ImportError:
        print(
            "ERROR: recommended settings need lightning-pose 2.4.1 or newer.",
            file=sys.stderr,
        )
        sys.exit(1)

    csv_paths = [Path(p) for p in args.csv]
    # A single CSV is read as single-view; the label file's other views are set below.
    analysis = recommender.analyze_dataset(csv_paths[0])
    if len(args.views) > 1:
        analysis = dataclasses.replace(analysis, csv_paths=csv_paths, view_names=args.views)
    if args.video_dir:
        video_dir = Path(args.video_dir)
        analysis = dataclasses.replace(
            analysis,
            video_dir=video_dir,
            has_videos=video_dir.is_dir() and any(video_dir.glob("*.mp4")),
        )
    gpu = recommender.get_gpu_info()
    rec = recommender.recommend(
        analysis, gpu, top_down_freely_moving=args.top_down_freely_moving
    )
    print(
        json.dumps(
            {
                "recommendation": dataclasses.asdict(rec),
                "gpu": dataclasses.asdict(gpu) if gpu else None,
                "labeledFrames": analysis.n_frames,
                "imageHeight": analysis.image_height,
                "imageWidth": analysis.image_width,
            }
        )
    )


if __name__ == "__main__":
    main()
