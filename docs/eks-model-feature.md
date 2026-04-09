# EKS Model Feature Plan

## Summary

We are adding a new model type called **EKS model** (Ensemble Kalman Smoother). An EKS model represents an ensemble of existing trained models in the project's `models/` directory. Unlike a normal model (which requires training), an EKS model is created instantly by writing an `ensemble.yaml` file into a new model directory. When inference is run on an EKS model, the app first runs `litpose predict` on each member model to populate their `video_preds/` directories, then runs the EKS smoother (via `eks.multicam_smoother.fit_eks_multicam`) to produce smoothed predictions saved into the EKS model's `video_preds/`.

**Example `ensemble.yaml`:**
```yaml
members:
  - id: seed1          # model_relative_path of a member model
  - id: seed2
view_names: [Cam-A, Cam-B, Cam-C, Cam-D, Cam-E, Cam-F]
smooth_param: 1000
quantile_keep_pca: 50.0
```

---

## How Normal Models Work (existing code)

### Disk structure
```
models/seed1/
  config.yaml           ← training config; presence = valid model
  train_status.json     ← {"status": "PENDING"|"STARTED"|"COMPLETED"...}
  train_stdout.log / train_stderr.log
  tb_logs/
  image_preds/
  video_preds/<session>_<CamName>.csv
```

### Backend key files
- `app_server/src/litpose_app/routes/models.py` — CRUD routes + `ModelListResponseEntry` schema
- `app_server/src/litpose_app/train_scheduler.py` — polls for PENDING models, calls `litpose train`
- `app_server/src/litpose_app/routes/inference.py` — SSE inference route, calls `litpose predict`
- `app_server/src/litpose_app/datatypes.py` — `Project`, `ProjectPaths`, `ProjectConfig`

### Frontend key files
- `web_ui/src/app/modelconf.ts` — `ModelListResponseEntry`, `mc_util`, `ModelType`, etc.
- `web_ui/src/app/create-model-dialog/create-model-dialog.component.ts` — multi-tab form → calls `createTrainingTask`
- `web_ui/src/app/models-list/models-list.component.ts` — polls and renders model list
- `web_ui/src/app/models-page/models-page.component.ts` — page shell, "Create Model" button
- `web_ui/src/app/model-inference-dialog/model-inference-dialog.component.ts` — video select + SSE inference

### Create model flow
1. UI: `CreateModelDialogComponent` → `sessionService.createTrainingTask(name, yaml)`
2. API: `POST /app/v0/rpc/createTrainTask` (models.py:80)
3. Creates `model_dir/<name>/`, writes `config.yaml`, `train_status.json` (PENDING), blank logs
4. `train_scheduler.py` picks it up, calls `litpose train config.yaml --output_dir model_dir`

### List models flow
1. API: `POST /app/v0/rpc/listModels` (models.py:130)
2. `read_models_l1_from_base` iterates subdirs, reads `config.yaml` + `train_status.json`
3. Models without `config.yaml` are treated as group dirs and recursed one level

### Inference flow
1. UI: `ModelInferenceDialogComponent` → `sessionService.inferModelSse(modelRel, videos)`
2. API: `GET /app/v0/sse/InferModel` (inference.py:208)
3. Launches `litpose predict model_dir <videos> --progress_file ...` in thread pool
4. Streams `InferenceTaskStatus` as SSE

---

## Phase 1: Create EKS Model

### 1a. Backend — New API endpoint

**File: `app_server/src/litpose_app/routes/models.py`**

Add new Pydantic models:
```python
class EnsembleMember(BaseModel):
    id: str  # model_relative_path

class CreateEksModelRequest(BaseModel):
    projectKey: str
    modelName: str = Field(..., min_length=1)
    members: list[EnsembleMember]
    view_names: list[str]
    smooth_param: float = 1000.0
    quantile_keep_pca: float = 50.0

class CreateEksModelResponse(BaseModel):
    ok: bool
```

New route `POST /app/v0/rpc/createEksModel`:
1. Validate `modelName` maps within `model_dir` (same pattern as `createTrainTask`)
2. Create directory
3. Write `ensemble.yaml` with members + params (use `yaml.dump`)
4. Do NOT write `train_status.json` (no training for EKS)

### 1b. Backend — Extend `ModelListResponseEntry` to carry model kind

**File: `app_server/src/litpose_app/routes/models.py`**

```python
class ModelListResponseEntry(BaseModel):
    model_name: str
    model_relative_path: str
    model_kind: Literal['normal', 'eks'] = 'normal'   # NEW
    config: dict | None                                # config.yaml (normal models)
    ensemble_config: dict | None = None                # ensemble.yaml (eks models)
    status: TrainStatus | None = None
```

Update `read_model_config` (currently inside `read_models_l1_from_base`, line 159):
- Check `ensemble.yaml` first: if present → `model_kind='eks'`, parse it into `ensemble_config`, set `config=None`
- Else check `config.yaml` as before → `model_kind='normal'`
- An EKS model dir with only `ensemble.yaml` is valid (no need to recurse)

Update `list_models` (line 130): the current logic skips models where `config is None` after recursion. Adjust to also keep models where `model_kind == 'eks'` and `ensemble_config is not None`.

### 1c. Frontend — Update TypeScript types

**File: `web_ui/src/app/modelconf.ts`**

```typescript
export interface EnsembleMember {
  id: string;
}

export interface EnsembleConfig {
  members: EnsembleMember[];
  view_names: string[];
  smooth_param: number;
  quantile_keep_pca: number;
}

export interface ModelListResponseEntry {
  model_name: string;
  model_relative_path: string;
  model_kind: 'normal' | 'eks';        // NEW
  config?: ModelConfig;
  ensemble_config?: EnsembleConfig;    // NEW
  status?: TrainStatus;
}
```

Update `mc_util`:
- `get type()`: guard against null `config` for EKS models; return a new sentinel like `'EKS'`
- `get status()`: return `'COMPLETED'` when `model_kind === 'eks'`

### 1d. Frontend — New Create EKS Model Dialog

**New file: `web_ui/src/app/create-eks-model-dialog/create-eks-model-dialog.component.ts`**

Form fields:
- `modelName`: text input (same validators as normal model)
- `members`: multi-select of existing **normal** models (from `ModelsListComponent`'s model list)
- `smoothParam`: number (default 1000)
- `quantileKeepPca`: number (default 50.0)

On submit: call new `sessionService.createEksModel(...)` method which POSTs to `/app/v0/rpc/createEksModel`.

### 1e. Frontend — Wire into Models Page

**File: `web_ui/src/app/models-page/models-page.component.ts`** (and `.html`)

The page already has a dropdown menu (lines show `DropdownComponent` imported). Add a second option in the "Create" dropdown:
- "Create Training Model" → opens existing `CreateModelDialogComponent`
- "Create EKS Model" → opens new `CreateEksModelDialogComponent`

### 1f. Frontend — Visual distinction in models list

**File: `web_ui/src/app/models-list/models-list.component.ts`** (and `.html`)

Add a badge or label next to EKS models in the list (e.g., "EKS" tag). Normal models show no tag or "Model" tag.

### 1g. Frontend — Model detail view

**File: `web_ui/src/app/models-page/model-detail/model-detail.component.ts`** (and `.html`)

- For EKS models: show ensemble config (members list, smooth_param, quantile_keep_pca). Hide training-specific tabs (logs, config.yaml editor).
- For normal models: behavior unchanged.

---

## Phase 2: Inference on EKS Model

### Overview of inference pipeline

For an EKS model with members `[seed1, seed2]` and videos `[session1_Cam-A.mp4, ...]`:

1. **Step 1 — Member inference**: For each member model, run `litpose predict`. It will run and skip prediction if the expected `video_preds/<session>_<CamName>.csv` already exists.
2. **Step 2 — EKS smoothing**: Call `fit_eks_multicam(input_source=[...all member pred CSVs...], save_dir=eks_model_dir/video_preds/, camera_names=[...], smooth_param=..., quantile_keep_pca=...)`

### Backend approach

**File: `app_server/src/litpose_app/routes/inference.py`**

New route `GET /app/v0/sse/InferEksModel` (mirrors `InferModel` pattern):
- Accept same params: `projectKey`, `modelRelativePath`, `videoRelativePaths`
- Load `ensemble.yaml` from model dir
- Compute total steps = `(n_members × n_videos) + 1 EKS step` but weight EKS step by `n_videos` because its computationally intensive
- Submit background task that:
  1. For each member: run `litpose predict member_dir <matching_videos>` — update progress. Use existing inference command.
  2. Build `input_files` list (all `member_dir/video_preds/<session>_<cam>.csv`)
  3. Create and execute a script that uses the critical parts of `/media/ksikka/data/untar_datasets/fly_anipose_subset/run_eks.py`. It should get input files list from CLI args, and store outputs in `eks_model_dir/video_preds/` in the same structured format as non-ensemble model members.
  4. Mark DONE
- Stream `InferenceTaskStatus` as SSE

### Frontend approach

**File: `web_ui/src/app/model-inference-dialog/model-inference-dialog.component.ts`**

- When `model_kind === 'eks'`, call `sessionService.inferEksModelSse(...)` instead of `inferModelSse`
- Progress UI can remain the same (same `InferenceUiState` shape)
- Optionally show additional detail: "Running member inference (2/3)..." vs "Running EKS smoother..."

---

## Verification

Unit tests for backend are run using `pytest` from the `app_server` directory in the repo root.
Frontend: do npm build, npm test, and make sure storybook can run or build.

### Phase 1
1. Start dev server; create a new EKS model via UI → verify `ensemble.yaml` created in `models/<name>/`
2. `listModels` response includes the EKS model with `model_kind: 'eks'` and `ensemble_config`
3. EKS model appears in list with visual badge
4. Model detail panel shows ensemble members and params
5. Normal model creation and listing still works unchanged

### Phase 2
1. Run EKS inference on a model where member predictions already exist → verify EKS smoother output CSVs in `eks_model_dir/video_preds/`
2. Run EKS inference when member predictions are missing → verify member inference is triggered first
3. SSE progress updates correctly (per-member step + EKS step)
