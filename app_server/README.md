# Lightning Pose App

[![PyPI version](https://img.shields.io/pypi/v/lightning-pose-app.svg)](https://pypi.org/project/lightning-pose-app/)

Web-based GUI for [Lightning Pose](https://github.com/paninski-lab/lightning-pose) —
a semi-supervised pose estimation library for single- and multi-view animal tracking.

The app provides an end-to-end workflow:

- **Project management** — create and organize pose estimation projects
- **Labeler** — extract video frames and annotate keypoints
- **Models** — configure and launch model training, monitor progress in real time
- **Inference** — run trained models across video sessions
- **Viewer** — inspect predictions overlaid on video with per-keypoint controls

## Installation

Install Lightning Pose and the app:

```bash
pip install lightning-pose lightning-pose-app
```

## Usage

```bash
litpose run_app
```

Then open `http://localhost:4200` in your browser.

## Documentation

Full documentation, including installation guides and tutorials:

👉 **[https://lightning-pose.readthedocs.io](https://lightning-pose.readthedocs.io)**

## Requirements

- Linux or WSL (Windows Subsystem for Linux)
- NVIDIA GPU with CUDA 12+
- Python 3.10–3.12

## Source

This package contains only the app server and compiled UI.
The core modeling library lives at
[paninski-lab/lightning-pose](https://github.com/paninski-lab/lightning-pose).
