## Development

### Python setup

Create and activate the conda environment (Python 3.10–3.12):

```bash
conda create -n poseapp python=3.12
conda activate poseapp
```

Install lightning-pose in editable mode from its local clone:

```bash
cd /path/to/lightning-pose
pip install -e .
```

Then install this package in editable mode with dev dependencies:

```bash
conda activate poseapp
cd app_server
pip install -e ".[dev]"
```

### UI Development required tools 

To compile the app (only necessary for UI development) you will need to install Node.js and angular devtools.

```bash
# Install nvm (node version manager), the recommended way to install node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Reload the shell to initialize `nvm` related environment variables.  
Then:

```bash
nvm install 26
nvm use 26
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
# Runs services defined in the Procfile.dev 
honcho -f Procfile.dev start
```

The angular dev server `ng serve` is the primary endpoint which forwards some requests to uvicorn (see [proxy.conf.json](web_ui/src/proxy.conf.json)).
This is a dev-only setup: in production, static assets including the compiled angular app are served by `uvicorn`.

The use of angular's dev server is for hot module reloading, meaning when you change an angular source file, the UI automatically updates without even a page reload.
Uvicorn is also run with reload=True, so when you change a python file, the uvicorn server reloads.

### Linting and code quality

**Python — ruff (via pre-commit)**

Install the pre-commit hooks once after cloning:

```bash
conda activate poseapp
pre-commit install
```

After that, ruff runs automatically on every `git commit`. To run manually:

```bash
cd app_server
ruff check src/litpose_app tests/          # check
ruff check --fix src/litpose_app tests/    # auto-fix
```

Ruff is configured in `app_server/pyproject.toml` under `[tool.ruff]`.

**Frontend — ESLint**

```bash
cd web_ui
npx ng lint          # check
npx ng lint --fix    # auto-fix
```

ESLint is configured in `web_ui/eslint.config.js`.

Both linters also run in CI on every pull request (`.github/workflows/lint.yml`).

### Building and running a production release

With the development setup above (no need for honcho), run
```bash
sh build_ui.sh
```

This calls `ng build` to compile the app as static files, and puts them inside the `app_server` directory. Specifically, `app_server/src/litpose_app/ngdist`. It's gitignored so you won't check it in by accident.

The python server is configured to serve the app out of that directory. You can run the app normally:
```bash
litpose run_app
```

And when you build a release of `litpose_app`, the package will include the compiled angular app files,
as this is the default behavior of the build backend.


```bash
# If needed:
pip install build

./build_release.sh # Invokes build_ui.sh under the hood.
# Outputs dist/*.whl. Distributions contain the compiled angular app from build.sh.
```
