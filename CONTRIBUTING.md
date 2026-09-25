# Contributing

Thanks for wanting to improve Lightning Pose App. Questions and informal feedback are welcome on [Discord](https://discord.gg/tDUPdRj4BM). Bugs with a clear repro belong in [GitHub Issues](https://github.com/paninski-lab/lightning-pose-app/issues).

You should not have to clone this repo unless you are changing app source. Everyday use is `pip install lightning-pose lightning-pose-app` — see the [README](README.md) and [user docs](https://lightning-pose.readthedocs.io/).

Stack and code patterns for this codebase: [CLAUDE.md](CLAUDE.md). Maintainer notes, including releases and this team's Lightning Studio setup: [DEV.md](DEV.md).

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

Only needed if you change the UI or run the Angular tooling. 

If you're unfamiliar with Node.js or Angular:

| Name | What it is |
|------|------------|
| **Node** | The program that runs the UI tooling. This repo needs **Node 26** (`web_ui/.nvmrc`). |
| **nvm** | Switches which Node version the **current terminal** uses. `nvm use 26` is not remembered by the next terminal. |
| **npm** | Installs UI dependencies into `web_ui/node_modules`, and runs scripts from `web_ui/package.json` (`npm run storybook`, and so on). |
| **ng** | The Angular command-line tool. It is not installed with the operating system. `npm install` in `web_ui` puts it at `web_ui/node_modules/.bin/ng`. Typing `ng` by itself fails unless that directory is on `PATH`. `npm run …` and [Procfile.dev](Procfile.dev) call that local file for you. A global `npm install -g @angular/cli` is optional. |

Install once per machine with [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# reload the shell, then:
nvm install 26
nvm use 26

cd web_ui && npm install
```

Every **new terminal** that will run `honcho`, `npm`, `npx ng`, or [scripts/build/build_ui.sh](scripts/build/build_ui.sh) needs Node 26 selected again (`nvm use 26`). Check with `node -v` (it should print `v26…`). The UI files under `web_ui/node_modules` stay installed; you do not repeat `npm install` unless that directory is missing or `package.json` changed.

## Running the dev servers

While editing, start both processes from the **repo root** (Node 26 on `PATH` in that terminal):

```bash
honcho -f Procfile.dev start
```

That starts:

- Angular `ng serve` at **http://localhost:4200** (primary URL). It compiles the UI in memory and reloads when UI files change. It does **not** write a build into the Python package. The page proxies `/app` to the backend ([web_ui/src/proxy.conf.json](web_ui/src/proxy.conf.json)).
- Uvicorn on **port 8080** with `--reload` for Python changes.

To run only one process, copy the matching line from [Procfile.dev](Procfile.dev). Backend-only: you can run the `uvicorn` command from that file without honcho.

If port 8080 or 4200 is already in use, stop the old `uvicorn` / `ng serve` (or `honcho`) before starting again.

### `litpose run_app` needs a separate UI build

`litpose run_app` is the packaged server, the same entry point users get after `pip install`. It starts **only Python**. It never runs `ng`. For the browser it reads HTML, CSS, and JavaScript that were compiled ahead of time into `app_server/src/litpose_app/ngdist/` (gitignored). A fresh clone does not contain that directory, so honcho can already be serving the app at port 4200 while `litpose run_app` still has nothing to show.

If `ngdist` is missing, the process prints a warning and the API still starts, but opening `/` returns 500 because `index.html` is not there.

Build the UI once (and again after UI changes you want this server to pick up). From the repo root, with Node 26 on `PATH`:

```bash
./scripts/build/build_ui.sh
```

That script runs `ng build` and writes the compiled files to `app_server/src/litpose_app/ngdist/`. Then:

```bash
litpose run_app
# On a cloud VM the browser is not on localhost, so listen on all interfaces:
litpose run_app --host 0.0.0.0
```

Day-to-day UI work stays on honcho (`http://localhost:4200`). Use `litpose run_app` when you want to check the packaged server. Wheel and release steps that also call this build are in [DEV.md](DEV.md).

## UI components

The UI uses [DaisyUI](https://daisyui.com/) 5 on Tailwind CSS. The theme is `dim`, set in [web_ui/src/styles.css](web_ui/src/styles.css). Prefer DaisyUI classes (`btn`, `input`, `range`, `menu`, `tooltip`, `modal`, and so on) over custom CSS for buttons, fields, sliders, menus, and dialogs.

Put an Angular component in [web_ui/src/app/components/](web_ui/src/app/components/) when the widget is reused or has behavior of its own (for example the dropdown, alert dialog, and path fields). Leave UI that belongs to one feature next to that feature (for example [web_ui/src/app/video-player/](web_ui/src/app/video-player/)). Do not wrap a single DaisyUI button in its own component.

Add a `*.stories.ts` file next to each component under `components/`. Add one for a feature surface too, when it can be rendered without the rest of the page. Storybook loads the same stylesheet as the app.

From `web_ui`, with Node 26 on `PATH` in that terminal:

```bash
npm run storybook
```

Open **http://localhost:6006**.

One allowed exception: the Viewer frame and time fields stay small custom inputs (`.jump-field` in the video controls). DaisyUI's `input` padding and height do not stay inline in that bar. The seek slider uses DaisyUI `range`.

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

Names like `feature/…` or `fix/…` work well. Use one short-lived branch per feature or per bugfix bundle. Combining is fine when the changes touch the same part of the code. Do not mix unrelated areas into one PR. After merge, delete the branch and `git pull` on `main` before starting the next change.

Org members can push a branch on this repo. External contributors should [fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks) and open a PR from the fork.