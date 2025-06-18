# Lightning pose app 2.0


Status: In development
* Multiview prediction viewer is in a usable state.
* Labeler under development
* Model management not yet started.

## Features

The new app will have three modules:
1. Viewer: support for scrubbing through synced multiview video and their error traces
2. Labeling: support for multiview with camera calibrations, no longer using LabelStudio 
3. Model management

The modules will also be developed in roughly that order.

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

### Installation option 1: From the PyPi distribution

This is the simplest option appropriate for most users.
```bash
pip install lightning-pose lightning-pose-app
```

### Installation option 2: From source

```bash
# (If you haven't already) Install lightning-pose core
git clone https://github.com/paninski-lab/lightning-pose.git
cd lightning-pose
pip install -e ".[dev]"

# Install the app
git clone https://github.com/paninski-lab/lightning-pose-app.git
cd lightning-pose-app/app_server
pip install -e .
cd ..
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
```
(This step will be part of the UI in the future, but for now you have to do it manually.)
2. Run the app: `litpose app`
3. The webserver is now listening at `http://localhost:8080`!

## Development

### UI Development required tools 

To compile the app (only necessary for UI development) you will need to install Node.js and angular devtools.

```bash
# Install nvm (node version manager), the recommended way to install node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Reload the shell to initialize `nvm` related environment variables.  
Then:

```bash
nvm install node
npm install -g @angular/cli

# Install project dependencies from web_ui/package.json.
# Outputs a node_modules folder which is gitignored.
cd web_ui && npm install
```

### Running the dev servers

You need to run two servers: the backend server, and an angular dev server. If you only want to run one or the other,
use the relevant command inside `Procfile.dev`. If you're only starting the backend server (not doing any UI development),
you can directly use the uvicorn command inside Procfile.dev instead of honcho.

```bash
# Installs a tool that's useful for running multiple servers at once
pip install honcho

# Runs services defined in the Procfile.dev 
honcho -f Procfile.dev start
```

The angular dev server `ng serve` is the primary endpoint which forwards some requests to uvicorn (see [proxy.conf.json](web_ui/src/proxy.conf.json)).
This is a dev-only setup: in production, static assets including the compiled angular app are served by `uvicorn`.

The use of angular's dev server is for hot module reloading, meaning when you change an angular source file, the UI automatically updates without even a page reload.
Uvicorn is also run with reload=True, so when you change a python file, the uvicorn server reloads.

### Building and running a production release

With the development setup above (no need for honcho), run
```bash
sh build.sh
```

This calls `ng build` to compile the app as static files, and puts them inside the `app_server` directory. Specifically, `app_server/src/litpose_app/ngdist`. It's gitignored so you won't check it in by accident.

The python server is configured to serve the app out of that directory. You can run the app normally:
```bash
litpose app
```

And when you build a release of `litpose_app`, the package will include the compiled angular app files,
as this is the default behavior of the build backend.


```bash
# If needed:
pip install build

cd app_server
python -m build .
# Outputs dist/*.whl. Distributions contain the compiled angular app from build.sh.
```
