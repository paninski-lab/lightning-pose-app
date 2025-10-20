# Lightning pose app 2.0


Status: In development
* Multiview prediction viewer is in a usable state, needs polish.
* Labeler is in a usable state, needs polish.
* Model management is in development...

## Features

The app has three modules:
1. Viewer: support for scrubbing through synced multiview video and their error traces
2. Labeling: support for multiview with camera calibrations, no longer using LabelStudio 
3. Model management

## Installation

You can install the app either locally or to a remote server.

### Using environment managers like conda

We recommend having a single lightning-pose environment (say, `lp`) for all your lightning-pose
related package installations. This keeps lightning-pose dependencies separate from any other
data analysis stacks you may be using, while allowing the various lightning-pose packages to
share dependencies. 

A conda example:

```bash
# Create the environment
conda create -n lp python=3.12

# Activate the environment
conda activate lp
```

### Installation

```bash
pip install lightning-pose lightning-pose-app
```

### Installation for developers

```bash
# Install lightning-pose core
git clone https://github.com/paninski-lab/lightning-pose.git
cd lightning-pose
pip install -e ".[dev]"
cd ..

# Install the app
git clone https://github.com/paninski-lab/lightning-pose-app.git
cd lightning-pose-app/app_server
pip install -e .
```

## Usage

1. First create a config file at `~/.lightning-pose/project.toml`
```toml filename="project.toml"
data_dir = "/Path to a directory containing all the data (videos, labels, etc)."
model_dir = "/Path to a directory containing all the models."
views = [
    "topLeft",
    "(Your video filenames must contain a view name, ie session123_topLeft.mp4)",
]
keypoint_names = [
    "leftPaw",
    "rightPaw",
]
```
(This step will be automated in the future, but for now it's manual.)
2. Run the app: `litpose app` (equivalent to running `uvicorn litpose_app.main:app --port 8080` if running without lightning-pose)
3. The webserver is now listening at `http://localhost:8080`!
