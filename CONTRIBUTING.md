# Contributing

Thanks for wanting to improve Lightning Pose App. Questions and informal feedback are welcome on [Discord](https://discord.gg/tDUPdRj4BM). Bugs with a clear repro belong in [GitHub Issues](https://github.com/paninski-lab/lightning-pose-app/issues).

You should not have to clone this repo unless you are changing app source. Everyday use is `pip install lightning-pose lightning-pose-app` — see the [README](README.md) and [user docs](https://lightning-pose.readthedocs.io/).

Stack and code patterns for this codebase: [CLAUDE.md](CLAUDE.md). Maintainer release process: [DEV.md](DEV.md).

## Development install

You need a Linux or WSL environment, Python 3.10–3.12, and Node.js 26 (for UI work). A local clone of [lightning-pose](https://github.com/paninski-lab/lightning-pose) is required so the app can import the library.

### Python

```bash
conda create -n poseapp python=3.12
conda activate poseapp

cd /path/to/lightning-pose
pip install -e .

cd /path/to/lightning-pose-app/app_server
pip install -e ".[dev]"
```

`[dev]` installs pytest, ruff/pre-commit helpers, and related tools.

### Node (UI)

Only needed if you change Angular sources or run `ng` locally. Use [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# reload the shell, then:
nvm install 26
nvm use 26

cd web_ui && npm install
```

`Procfile.dev` runs the **local** Angular CLI (`web_ui/node_modules/.bin/ng`). A global `npm install -g @angular/cli` is optional.

Node 26 must be on `PATH` so `ng` is executed with a matching `node` (see `web_ui/.nvmrc`).

## Running the dev servers

From the **repo root**:

```bash
honcho -f Procfile.dev start
```

That starts:

- Angular `ng serve` at **http://localhost:4200** (primary URL; hot reload). It proxies `/app` to the backend ([web_ui/src/proxy.conf.json](web_ui/src/proxy.conf.json)).
- Uvicorn on **port 8080** with `--reload` for Python changes.

To run only one process, copy the matching line from [Procfile.dev](Procfile.dev). Backend-only: you can run the `uvicorn` command from that file without honcho.

This is **not** the packaged app. Production (`litpose run_app`) serves a compiled Angular build from `app_server/src/litpose_app/ngdist` (see [DEV.md](DEV.md)).

If port 8080 or 4200 is already in use, stop the old `uvicorn` / `ng serve` (or `honcho`) before starting again.

## Linting

Install hooks once after clone:

```bash
conda activate poseapp
pre-commit install
```

Ruff then runs on every `git commit`. Manually:

```bash
cd app_server
ruff check src/litpose_app tests/
ruff check --fix src/litpose_app tests/
```

Frontend:

```bash
cd web_ui
npx ng lint
npx ng lint --fix
```

CI runs both on pull requests ([.github/workflows/lint.yml](.github/workflows/lint.yml)).

## Tests

```bash
cd app_server
pytest --ignore=tests/test_predict_wrapper.py
```

`test_predict_wrapper.py` is excluded from CI (needs a GPU-oriented env). Skip it unless you know you have that setup.

UI (needs Node 26 on `PATH`):

```bash
cd web_ui
npx ng test --no-watch --browsers=ChromeHeadless
```

## Pull requests

Do not push feature or bugfix commits to `main`. Branch from up-to-date `origin/main`:

```bash
git fetch origin
git checkout -b feature/short-name origin/main
# ... commit ...
git push -u origin HEAD
gh pr create --base main
```

Names like `feature/…` or `fix/…` work well. After merge, delete the branch and `git pull` on `main` before starting the next change.

Org members can push a branch on this repo. External contributors should [fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks) and open a PR from the fork.