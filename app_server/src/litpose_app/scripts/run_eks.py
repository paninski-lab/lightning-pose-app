#!/usr/bin/env python
"""Run the EKS smoother on a set of prediction CSV files.

Usage (multiview):
    python run_eks.py \
        --save_dir /path/to/eks_model/video_preds \
        --camera_names Cam-A Cam-B Cam-C \
        --smooth_param 1000 \
        --quantile_keep_pca 50.0 \
        [--calibration /path/to/calibration.toml --save_3d_dir /path/to/eks_model/video_preds_3d] \
        --input_files member1/video_preds/session_Cam-A.csv ...

Usage (single-view): leave out --camera_names, or give one name; one input file
per member model, each with the same name ({session}.csv, or {session}_{view}.csv
for a one-view project). The smoothed output is saved under that name.

Multiview input files must be ordered: for each member model, one file per camera,
with cameras in the same order as --camera_names.
Each input file must follow the naming convention {session}_{view}.csv
(e.g., "session_Cam-A.csv").

--calibration switches the multiview smoother from linear to nonlinear
(camera projection). With --save_3d_dir it also saves the 3D estimates as
{session}.csv in that folder.
"""
from __future__ import annotations

import argparse
import multiprocessing
import os
import sys
from pathlib import Path


def _plot_one(args: tuple) -> None:
    """Generate and save a per-keypoint debug plot for one camera using EKS results."""
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


def main() -> None:
    """Parse CLI arguments and run the EKS smoother, saving smoothed CSVs to save_dir."""
    parser = argparse.ArgumentParser(description="Run EKS smoother")
    parser.add_argument("--save_dir", required=True, help="Directory to save smoothed outputs")
    parser.add_argument(
        "--camera_names", nargs="*", default=[],
        help="Ordered list of camera names; leave out for a single-view project",
    )
    parser.add_argument("--smooth_param", type=float, default=1000.0)
    parser.add_argument("--quantile_keep_pca", type=float, default=50.0)
    parser.add_argument("--input_files", nargs="+", required=True, help="Prediction CSV files (member × camera order)")
    parser.add_argument("--debug_plots", action="store_true", default=False, help="Save per-keypoint debug plots for all cameras")
    parser.add_argument("--calibration", default=None, help="Calibration .toml; runs the nonlinear multiview smoother")
    parser.add_argument("--save_3d_dir", default=None, help="With --calibration, save the 3D estimates here as {session}.csv")
    args = parser.parse_args()

    if len(args.camera_names) < 2:
        if args.calibration:
            print("ERROR: --calibration needs two or more --camera_names (nonlinear EKS is multiview only)", file=sys.stderr)
            sys.exit(2)
        _run_singlecam(args)
        return

    try:
        from eks.multicam_smoother import fit_eks_multicam
    except ImportError:
        print("ERROR: eks package not found. Install it with: pip install eks", file=sys.stderr)
        sys.exit(1)

    save_dir = Path(args.save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)

    smoother = "nonlinear" if args.calibration else "linear"
    print(
        f"Running {smoother} EKS on {len(args.input_files)} input files across {len(args.camera_names)} cameras",
        flush=True,
    )
    if args.calibration:
        print(f"Calibration: {args.calibration}", flush=True)
    print(f"Saving to: {save_dir}", flush=True)

    camera_dfs, s_finals, input_dfs, bodypart_list, df_3d = fit_eks_multicam(
        input_source=args.input_files,
        save_dir=str(save_dir),
        camera_names=args.camera_names,
        bodypart_list=None,
        smooth_param=args.smooth_param,
        s_frames=None,
        quantile_keep_pca=args.quantile_keep_pca,
        verbose=True,
        calibration=args.calibration,
        # The 3D file is written below under its session name, not into save_dir.
        save_3d_outputs=False,
    )

    # Extract session name from first input file ("{session}_{view}.csv")
    from litpose_app.session_view import session_of

    session_name = session_of(Path(args.input_files[0]).stem, args.camera_names)

    if args.calibration and args.save_3d_dir and df_3d is not None:
        save_3d_dir = Path(args.save_3d_dir)
        save_3d_dir.mkdir(parents=True, exist_ok=True)
        df_3d.to_csv(save_3d_dir / f"{session_name}.csv")

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


def _run_singlecam(args: argparse.Namespace) -> None:
    """Run the single-view EKS smoother and save it to save_dir under the input file name."""
    try:
        from eks.singlecam_smoother import fit_eks_singlecam
    except ImportError:
        print("ERROR: eks package not found. Install it with: pip install eks", file=sys.stderr)
        sys.exit(1)

    save_dir = Path(args.save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)
    # Every member's file has the same name ({session}.csv or {session}_{view}.csv).
    save_file = save_dir / Path(args.input_files[0]).name

    print(f"Running single-view EKS on {len(args.input_files)} input files", flush=True)
    print(f"Saving to: {save_file}", flush=True)

    fit_eks_singlecam(
        input_source=args.input_files,
        save_file=str(save_file),
        bodypart_list=None,
        smooth_param=args.smooth_param,
        s_frames=None,
        verbose=True,
    )
    print("EKS complete.", flush=True)


if __name__ == "__main__":
    main()
