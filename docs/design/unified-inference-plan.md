# Unified Inference: Plan

## Overview
The goal of this system is to provide a single, unified API for running inference on multiple models (both normal and EKS) across multiple sessions. It simplifies the client logic by handling session resolution, model dependencies (member models for ensembles), and performance optimizations (skipping existing predictions).

---

## API Specifications

### 1. Start Inference Task
`POST /app/v0/inference/task`

Starts a background inference task.

**Request Body:**
```json
{
  "projectKey": "string",
  "models": ["relative/path/to/model1", "relative/path/to/model2"],
  "sessions": ["session1", "session2"],
  "force": false
}
```

`sessions` may be `["all"]` to enumerate all sessions from `data_dir`. `force: true` disables the skip check.

**Response:**
```json
{
  "taskId": "uuid-string",
  "status": "ACCEPTED"
}
```

---

### 2. Get Task Status
`GET /app/v0/inference/task/{taskId}`

Returns the current state and progress of the task.

**Response:**
```json
{
  "taskId": "uuid-string",
  "status": "RUNNING",
  "progress": 0.45,
  "message": "Member inference: model_a on session_2 (step 4/10)",
  "completedSteps": 5,
  "totalSteps": 12,
  "error": null,
  "completedAt": "2024-04-16T14:15:00Z"
}
```

Status values: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`.

`message` is always a human-readable description of the currently-executing step, including model name, session key, and overall step counter.

---

### 3. Stream Task Progress (SSE)
`GET /app/v0/inference/task/{taskId}/stream`

Subscribes to real-time status updates and logs.

**Events:**
- `status`: Same payload as Get Task Status.
- `log`: Plain text message or structured log.

---

### 4. Resolve Inference Task (Preview)
`POST /app/v0/inference/resolve`

Returns the ordered list of steps that *would* execute for a given request. The UI calls this before starting inference to show a preview count and list.

**Request Body:**
```json
{
  "projectKey": "my-project",
  "models": ["models/model_a", "models/eks_model_1"],
  "sessions": ["all"]
}
```

**Response:**
```json
{
  "runs": [
    {
      "model": "models/model_a",
      "session": "session_2024-01-01",
      "kind": "normal"
    },
    {
      "model": "models/model_b",
      "session": "session_2024-01-01",
      "kind": "member",
      "member_of": "models/eks_model_1"
    },
    {
      "model": "models/eks_model_1",
      "session": "session_2024-01-01",
      "kind": "eks"
    }
  ],
  "skipped_count": 5
}
```

**Key semantics:**

- **Only steps that will actually execute** appear in `runs`. Steps whose output already exists are excluded and counted in `skipped_count`.
- **Member model steps are expanded**: if `eks_model_1` has members `[model_b, model_c]` and `model_b`'s predictions for a session already exist but `model_c`'s do not, only `model_c` appears in `runs` (with `kind="member"`). The parent EKS step always appears if any member or the EKS smoother output is missing.
- **Ordering reflects execution order**: member steps for a session appear before the EKS step for that session.
- **`kind` values**:
  - `"normal"` — a directly-requested normal model
  - `"member"` — a member model run required as input to an EKS model (may also be directly requested)
  - `"eks"` — the EKS smoother step

The UI can use `runs.length` as the total step count and `skipped_count` to show "N steps, M already done".

---

## Execution Logic

### 1. Resolution
The backend performs two levels of resolution:

- **Model Resolution**:
    - If the model has `ensemble.yaml` (EKS), automatically resolve its member models and add them to the task set.
    - Otherwise, add it as a normal model.
- **Session Resolution**:
    - `sessions: ["all"]`: glob `videos*/**/*.mp4` under `data_dir`, group with `_derive_sessions(videos, project.config.view_names)`.
    - `sessions: [...]`: resolve the named sessions to corresponding video paths in `data_dir`.

### 2. Task Ordering
1. **Member Models**: Run `litpose predict` for all normal models (requested or as EKS dependencies) across all sessions.
2. **EKS Models**: Run the EKS smoother for each ensemble model, only after all its member models have completed inference for the required sessions.

*A simple two-pass strategy is sufficient since EKS models currently only depend on normal models.*

### 3. Skip Logic
A step is skipped (excluded from `runs`, added to `skipped_count`) when **all expected output files already exist**:

- **Normal / member model + session**: all `{model_dir}/video_preds/{session}_{cam}.csv` exist for every camera view.
- **EKS model + session**: all `{eks_model_dir}/video_preds/{session}_{cam}.csv` exist.
- **Single-view projects** (`view_names` is empty): check `{model_dir}/video_preds/{session}.csv`.

"All views" means every entry in `project.config.view_names`. If that list is empty, treat the project as single-view.

Skipped steps are counted as immediately completed in total progress. Setting `force: true` disables this check.

---

## Data Structures and Management

### Task Registry
The backend maintains an in-memory `TaskRegistry` (protected by a lock) to track active and recent tasks:
- `taskId`: Unique identifier (UUID).
- `status`: `InferenceTaskStatus` object (status, progress, message, etc.).
- `future`: The `concurrent.futures.Future` representing the background execution.
- `logs`: A list of log entries for historical retrieval.

### Task ID Generation
Use a **UUID** to allow multiple concurrent requests for the same models/sessions if needed.

### Background Runner
Uses a `ThreadPoolExecutor`. For a given task:
1. Resolve all `(model, session)` pairs.
2. Filter pairs based on skip logic.
3. Sort tasks by dependency order (Members → EKS).
4. Execute each step, updating the `TaskRegistry` and broadcasting via SSE.
5. On failure: mark the task as `FAILED` with context in the `error` field.

---

## Execution Plan Builder (`_build_infer_plan`)

Shared by both the `Infer` task handler and the `resolve` endpoint.

```python
@dataclass
class InferStep:
    kind: Literal['normal', 'member', 'eks']
    model_dir: Path
    session: str
    video_paths: list[Path]
    member_of: Path | None        # parent EKS model dir, for kind='member'
    member_dirs: list[Path]       # populated for kind='eks'
    ensemble_config: dict         # populated for kind='member' and 'eks'

@dataclass
class InferPlan:
    steps: list[InferStep]        # ordered, skip-filtered
    skipped_count: int
```

**Algorithm:**

1. For each model in `models`, determine kind (presence of `ensemble.yaml`).
2. Compute the set of sessions (see Resolution above).
3. For each (model, session) pair, in two passes:
   - **Pass 1 — normal and member models** (deduped by `(model_dir, session)`):
     - Add a `normal` step if directly requested and output is missing.
     - For each EKS model, expand its members; add a `member` step for each `(member_dir, session)` whose output is missing.
   - **Pass 2 — EKS models**:
     - Add an `eks` step for each `(eks_model_dir, session)` where the EKS smoother output is missing.
4. Increment `skipped_count` for every (model, session) pair that was entirely skipped.
5. Return `InferPlan(steps=..., skipped_count=...)`.

---

## Task Execution (`_start_batch_inference_background`)

```python
def _start_batch_inference_background(
    task_id: str,
    steps: list[InferStep],
    total: int,
)
```

- Sets `status=RUNNING, completedSteps=0, totalSteps=len(steps)`.
- Iterates `steps` in order. For each step:
  - Updates `message` with a human-readable description.
  - Runs the appropriate subprocess (`litpose predict` or `run_eks.py`).
  - On success: increments `completedSteps`.
  - On failure: sets `status=FAILED, error=<details>` and stops.
- On completion: sets `status=COMPLETED, completedSteps=totalSteps`.

---

## Frontend Changes

### `session.service.ts`

```typescript
// New unified methods
inferTask(
  models: string[],
  sessions: string[],
): Promise<{ taskId: string }>

streamTaskProgress(taskId: string): Observable<InferenceTaskStatus>

resolveInference(
  models: string[],
  sessions: string[],
): Promise<ResolveInferenceResponse>
```

Remove `inferModelSse` and `inferEksModelSse`.

TypeScript types:
```typescript
interface InferRun {
  model: string;
  session: string;
  kind: 'normal' | 'member' | 'eks';
  member_of?: string;
}

interface ResolveInferenceResponse {
  runs: InferRun[];
  skipped_count: number;
}
```

### `model-inference-dialog.component.ts`

- Call `inferTask([modelRel], sessions)` then stream progress.
- Remove `modelKind` input (backend dispatches by model kind automatically).

### `run-model-inference-dialog` (currently empty stub)

Implements the "Run All Sessions" dialog:

1. On open, load model list via `sessionService.listModels()`.
2. Show checkbox list of all models (all checked by default).
3. After selection, call `resolveInference(selectedPaths, ["all"])` and show a preview:
   _"X steps will run across Y sessions (Z skipped — predictions already exist)."_
4. "Run" button calls `inferTask(selectedPaths, ["all"])`, then streams progress with a progress bar showing the `message` field.
5. Escape / close button emits `close` output.

`models-page.component.ts` already has `openRunModelInferenceDialog()` and `handleRunModelInferenceDialogDone()` wired; check `models-page.component.html` and add the trigger button if absent.

---

## Files to Modify

| File | Change |
|---|---|
| `app_server/src/litpose_app/routes/inference.py` | Add `POST /inference/task`, `GET /inference/task/{id}`, `GET /inference/task/{id}/stream`, `POST /inference/resolve`; add `_build_infer_plan`, `InferStep`, `InferPlan`, `_start_batch_inference_background`, `_find_all_videos`, `_all_view_preds_exist`; remove `InferModel` and `InferEksModel` routes |
| `web_ui/src/app/session.service.ts` | Add `inferTask`, `streamTaskProgress`, `resolveInference`; remove `inferModelSse`, `inferEksModelSse` |
| `web_ui/src/app/model-inference-dialog/model-inference-dialog.component.ts` | Use `inferTask` + `streamTaskProgress`; remove `modelKind` input |
| `web_ui/src/app/run-model-inference-dialog/run-model-inference-dialog.component.ts` | Implement Run All Sessions dialog |
| `web_ui/src/app/run-model-inference-dialog/run-model-inference-dialog.component.html` | Implement template |
| `web_ui/src/app/models-page/models-page.component.html` | Add "Run All Sessions" trigger button if absent |

---

## Verification

1. **Normal model** — use inference dialog, add videos, run; verify predictions appear in `{model_dir}/video_preds/`.
2. **EKS model** — verify member models run first, then EKS smoother; verify output in `{eks_model_dir}/video_preds/`.
3. **Member skip** — run EKS inference twice; second run should show no `member` steps in the resolve preview and skip those steps at runtime.
4. **All sessions** — open Run All Sessions dialog, verify resolve preview counts are sensible; run and verify all session/model pairs complete.
5. **Resolve accuracy** — manually pre-create prediction CSVs for one session; verify that session is absent from `runs` in the resolve response and present in `skipped_count`.
6. **Mixed model list** — request both normal and EKS models; verify normal/member steps precede EKS steps in the resolve response and in execution order.
7. **Single-view project** — verify skip logic checks `{session}.csv` (no cam suffix) when `view_names` is empty.

---

## Future Enhancements
- **Pause/Cancel RPCs**: `POST /app/v0/inference/task/{taskId}/cancel` and `POST /app/v0/inference/task/{taskId}/pause`.
- **Persistence**: Store task history in a database or local JSON file to survive server restarts.
- **Priority Queue**: Implement a priority-based executor if multiple heavy tasks are queued.
