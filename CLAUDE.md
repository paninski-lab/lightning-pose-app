# Lightning Pose App — Developer Guide for Claude

## What this app does

Full-stack web UI for the `lightning-pose` pose-estimation library. Researchers use it to:
manage projects → extract/label video frames → train models → run inference → inspect predictions in a video viewer.

Ships as a pip package (`lightning-pose-app`) that serves both a FastAPI backend and a compiled Angular SPA from a single `uvicorn` process.

## Stack

- **Backend**: Python 3.12, FastAPI 0.116, Uvicorn, Pydantic v2, omegaconf/PyYAML, portalocker, OpenCV, aniposelib
- **Frontend**: Angular 21 (standalone components, zoneless change detection), TypeScript 5.9, DaisyUI 5 + Tailwind CSS v4, Angular Signals + RxJS

## How to run

```bash
# Activate env (Python)
conda activate poseapp  # Python 3.12, lightning-pose installed editable

# Dev servers (hot reload for both frontend and backend)
honcho -f Procfile.dev start
```

- Angular dev server: `http://localhost:4200` (primary endpoint)
- Uvicorn backend: `http://localhost:8080`
- In dev mode, Angular proxies `/app` paths to uvicorn (see `web_ui/src/proxy.conf.json`)

## How to test

```bash
# Backend
cd app_server
pytest tests/
# Note: tests/test_predict_wrapper.py is excluded from CI (requires conda env "lp" + GPU)

# Frontend unit tests
cd web_ui
export PATH="$HOME/.nvm/versions/node/v26.4.0/bin:$PATH"
npx ng test --no-watch --browsers=ChromeHeadless
```

## Repo structure

```
app_server/src/litpose_app/   # Python package
  main.py                     # FastAPI app, startup, static file serving
  rootconfig.py               # RootConfig (pydantic-settings, system paths)
  config.py                   # In-process app constants
  datatypes.py                # Core Pydantic models: Project, ProjectPaths, ProjectConfig
  deps.py                     # FastAPI dependency providers
  project.py                  # ProjectUtil: reads/writes projects.toml
  train_scheduler.py          # Separate spawned process: polls for PENDING, launches training
  routes/                     # One module per domain (project, models, inference, videos, etc.)
  migrations/                 # Numbered one-shot data migrations
  tasks/                      # extract_frames, transcode helpers
  utils/                      # gpu_lock, predict_wrapper, video helpers

web_ui/src/app/               # Angular app
  app.routes.ts               # All routes
  rpc.service.ts              # Single point of contact for all backend calls
  project-info.service.ts     # Holds project context signals/observables
  home-page/                  # Project list, create/delete/register dialogs
  project-home-page/          # Per-project card navigation
  labeler/                    # Frame extraction, keypoint annotation
  models-page/                # Model list + detail, training, EKS
  viewer/                     # Video player with overlaid predictions
```

## Critical patterns

### RPC (not REST)
All backend calls go through `POST /app/v0/rpc/<MethodName>`. The Angular `RpcService.call(method, params)` is the **only** way the frontend talks to the backend. Method names are camelCase/TitleCase matching Python route decorators exactly.

To add a new capability: add a route handler in the relevant `routes/` module → include the router in `main.py` if it's a new module → call it via `rpcService.call('yourMethod', payload)` in Angular.

The backend returns the full Python traceback as a 500 on any unhandled exception. Angular's `GlobalErrorHandler` shows it in a modal. This is intentional for a local tool.

### No database — filesystem is the store
- `~/.lightning-pose/projects.toml`: TOML registry of all projects
- `<data_dir>/project.yaml`: per-project config (view_names, keypoint_names)
- `<model_dir>/<model_name>/train_status.json`: training state machine
- `<model_dir>/<model_name>/config.yaml`: model training config (omegaconf YAML)
- `<data_dir>/CollectedData_<view>.csv`: label files (3-level MultiIndex: scorer × bodypart × x|y)
- `<data_dir>/CollectedData_<view>.unlabeled.jsonl`: unlabeled frame queue (JSONL)

### Training is asynchronous (scheduler process)
`createTrainTask` only writes `train_status.json` with `status: PENDING`. The `train_scheduler` process (spawned at startup) discovers it within ~2 s and launches `litpose train`. The web server never waits for training to complete.

### GPU serialization
Training and inference share a portalocker file lock at `/tmp/litpose_gpu.lock`. Only one can run at a time. The `ActiveTaskService` polls `/app/v0/task/active` every 5 s and drives the navbar animated indicator.

### EKS models
Identified by `ensemble.yaml` (not `config.yaml`) in the model directory. When inference is requested on an EKS model, member models run first automatically, then the EKS smoother runs.

### Atomic writes
Label CSV saves (`save_mvframe.py`) and status updates (`train_scheduler.py`) write to `<file>.tmp` then `os.replace()`. Never write label/status files directly in-place.

### Migrations
`migrations/__init__.py` lists all migrations. Each must implement `needs_migration(paths)` and `migrate(paths)`. They run at startup for every registered project and whenever project paths change.

## Angular patterns

### Standalone components, OnPush everywhere
Every component is standalone (declares its own `imports` array). `ChangeDetectionStrategy.OnPush` is the default.

### Zoneless — signals drive change detection
No `zone.js` in production. Use `signal()`, `computed()`, `effect()`. Templates must use signal-based bindings; imperative `detectChanges()` calls are rare.

### State pattern: Signals + RxJS bridge
Services expose data as both a `BehaviorSubject` (for reactive pipelines) and `toSignal()` (for templates). Example in `ProjectInfoService`: `allViews$` (Observable) + `allViews` (signal).

### Route resolver loads context before pages render
`contextResolver` runs `GetGlobalContext` + `getProjectInfo` RPCs in parallel before any project route activates. All project pages can assume context is available.

### Dialogs use native `<dialog>` element
`nativeElement.showModal()` / `.close()` — not Angular Material Dialog. No CDK overlay.

### Service scoping
`EnabledViewsKeypointsService` is provided at `ViewerPageComponent` level, not root. This creates a fresh instance per viewer page. Watch for this pattern if adding scoped services.

## Testing conventions

- Backend: `app.dependency_overrides[deps.root_config]` redirects `~/.lightning-pose` to `tmp_path` in all tests
- Frontend: Components that use `ProjectInfoService` must mock it. Use `jasmine.createSpyObj('ProjectInfoService', ['projectContext'], { projectInfo: { views: [], ... } })` with `mockService.projectContext.and.returnValue(null)`
- Specs that test methods which have moved to child components should be deleted, not fixed
