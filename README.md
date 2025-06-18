# Lightning pose app 2.0

Still under development. Intended to replace https://github.com/Lightning-Universe/Pose-app.

## Features

The new app will have three modules:
1. Viewer: support for scrubbing through synced multiview video and their error traces
2. Labeling: support for multiview with camera calibrations, no longer using LabelStudio 
3. Model management

The modules will also be developed in roughly that order.

## Usage

1. Install the server bundle `pip install lightning-pose[app]`
2. Create a config file at `~/.lightning-pose/project.toml`
```toml filename="project.toml"
data_dir =... # Path to a directory containing all the data (videos, labels, etc).
model_dir =... # Path to a directory containing all the models.
views = ["", ...] # Names of the camera views.
```
3. Run the app: `litpose app`
4. The webserver is now listening at `http://localhost:8080`!

## Development

For server development, you can clone the repo, `cd app/app_server`, and `pip install -e .`.

See the `Procfile.dev` file, `backend: ` key, for how to run just the uvicorn server.

### UI Development

You will need to setup UI-specific tooling using NodeJS.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Follow the instructions in the output for shell configuration. 
Then:

```bash
nvm install node
npm install -g @angular/cli

# Install project dependencies from web_ui/package.json.
# Outputs a node_modules folder which is gitignored.
cd web_ui && npm install

# Install honcho which just helps run multiple servers with one command.
pip install honcho
```
You're ready to go! Start the development server with:

```bash
honcho -f Procfile.dev start
```

The app is now live at `localhost:4200`.

### Details about the dev environment

The honcho tool runs services defined in the specified "Procfile". In this case, we run `ng serve`
which is Angular's dev server, and `uvicorn run` which is the python backend server. HTTP Requests flow through the Angular CLI, which forwards some requests to uvicorn (see [proxy.conf.json](web_ui/src/proxy.conf.json)).
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
