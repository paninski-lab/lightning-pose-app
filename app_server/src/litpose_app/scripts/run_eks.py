#!/usr/bin/env python
"""Run EKS multicam smoother on a set of prediction CSV files.

Usage:
    python run_eks.py \
        --save_dir /path/to/eks_model/video_preds \
        --camera_names Cam-A Cam-B Cam-C \
        --smooth_param 1000 \
        --quantile_keep_pca 50.0 \
        --input_files member1/video_preds/session_Cam-A.csv ...

Input files must be ordered: for each member model, one file per camera,
with cameras in the same order as --camera_names.
Each input file must follow the naming convention {session}_{view}.csv
(e.g., "session_Cam-A.csv").
"""
import argparse
import multiprocessing
import os
import sys
from pathlib import Path


def _plot_one(args):
    import matplotlib
    matplotlib.use('Agg')
    from eks.utils import plot_results
    output_df, input_dfs_list, key, idxs, s_final, save_dir = args
    plot_results(
        output_df=output_df,
        input_dfs_list=input_dfs_list,
        key=key,
        idxs=idxs,
        s_final=s_final,
        nll_values=None,
        save_dir=save_dir,
        smoother_type='multicam',
    )


def main():
    parser = argparse.ArgumentParser(description="Run EKS multicam smoother")
    parser.add_argument("--save_dir", required=True, help="Directory to save smoothed outputs")
    parser.add_argument("--camera_names", nargs="+", required=True, help="Ordered list of camera names")
    parser.add_argument("--smooth_param", type=float, default=1000.0)
    parser.add_argument("--quantile_keep_pca", type=float, default=50.0)
    parser.add_argument("--input_files", nargs="+", required=True, help="Prediction CSV files (member × camera order)")
    parser.add_argument("--debug_plots", action="store_true", default=False, help="Save per-keypoint debug plots for all cameras")
    args = parser.parse_args()

    try:
        from eks.multicam_smoother import fit_eks_multicam
    except ImportError:
        print("ERROR: eks package not found. Install it with: pip install eks", file=sys.stderr)
        sys.exit(1)

    save_dir = Path(args.save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)

    print(f"Running EKS on {len(args.input_files)} input files across {len(args.camera_names)} cameras", flush=True)
    print(f"Saving to: {save_dir}", flush=True)

    camera_dfs, s_finals, input_dfs, bodypart_list, _df_3d = fit_eks_multicam(
        input_source=args.input_files,
        save_dir=str(save_dir),
        camera_names=args.camera_names,
        bodypart_list=None,
        smooth_param=args.smooth_param,
        s_frames=None,
        quantile_keep_pca=args.quantile_keep_pca,
        verbose=True,
    )

    # Extract session name from first input file (assumes pattern "{session}_{view}.csv")
    first_input = Path(args.input_files[0])
    session_name = first_input.stem.rsplit("_", 1)[0]

    # NOTE: EKS outputs files with the "multicam_{view}_results.csv" naming structure by default.
    # This script works around that by renaming them to "{session}_{view}.csv".
    # If EKS changes its output naming convention, this renaming logic would break.
    for view in args.camera_names:
        old_name = save_dir / f"multicam_{view}_results.csv"
        new_name = save_dir / f"{session_name}_{view}.csv"
        if old_name.exists():
            os.rename(old_name, new_name)
    print("EKS complete.", flush=True)

    # ── Debug plots for all keypoints, all cameras ───────────────────────────
    if not args.debug_plots:
        return

    try:
        plot_args = []
        for camera_c, cam_label in enumerate(args.camera_names):
            cam_save_dir = save_dir / "debug_plots" / session_name / cam_label
            cam_save_dir.mkdir(parents=True, exist_ok=True)
            idx_labels = input_dfs[camera_c][0].index
            idxs = (idx_labels[0], idx_labels[min(499, len(idx_labels) - 1)])
            for keypoint_i, kp_label in enumerate(bodypart_list):
                s_final = s_finals[keypoint_i] if hasattr(s_finals, '__getitem__') else s_finals
                plot_args.append((camera_dfs[camera_c], input_dfs[camera_c], kp_label, idxs, s_final, str(cam_save_dir)))

        with multiprocessing.get_context('spawn').Pool(os.cpu_count()) as pool:
            pool.map(_plot_one, plot_args)
        print("Debug plots saved.", flush=True)
    except Exception as e:
        print(f"WARNING: debug plots failed: {e}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
