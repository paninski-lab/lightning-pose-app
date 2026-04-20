# Inference Log Streaming: Design Addendum

## Overview

The current implementation runs `litpose predict` and EKS subprocesses with their stdout/stderr going to `/dev/null` (default `subprocess.Popen` behavior). This addendum designs the changes needed to capture those outputs and stream them incrementally to the UI as a terminal-style log view.

---

## Goals

1. Capture stdout/stderr from each subprocess and store it in an in-memory log buffer per task.
2. Extend the SSE stream to emit incremental log events alongside status events.
3. Add a terminal output component to the UI.
4. Update the Run Inference dialog to detect and reconnect to an ongoing task, showing the terminal output while it runs.

---

## Backend Changes

### 1. Per-task Log Buffer

Add a thread-safe append-only log store alongside the existing status store:

```python
_logs_by_task: Dict[str, List[str]] = {}
_logs_lock = threading.RLock()

def _append_log(task_id: str, line: str):
    with _logs_lock:
        _logs_by_task.setdefault(task_id, []).append(line)

def _get_logs(task_id: str, from_offset: int = 0) -> List[str]:
    with _logs_lock:
        return list(_logs_by_task.get(task_id, [])[from_offset:])
```

Log lines are plain strings. stdout and stderr are both captured; stderr lines are prefixed with `[stderr] ` to distinguish them.

### 2. Subprocess Log Capture

Replace the current fire-and-forget `subprocess.Popen(cmd).wait()` pattern with pipe readers:

```python
def _run_subprocess_with_logging(task_id: str, cmd: List[str]) -> int:
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    def _reader(pipe, prefix: str):
        for line in iter(pipe.readline, ''):
            stripped = line.rstrip('\n')
            if stripped:
                _append_log(task_id, f"{prefix}{stripped}")
        pipe.close()

    t_out = threading.Thread(target=_reader, args=(proc.stdout, ''), daemon=True)
    t_err = threading.Thread(target=_reader, args=(proc.stderr, '[stderr] '), daemon=True)
    t_out.start()
    t_err.start()
    ret = proc.wait()
    t_out.join()
    t_err.join()
    return ret
```

This helper replaces all `subprocess.Popen(cmd).wait()` calls in `_run_eks_step` and in the `_run` closure inside `_start_batch_inference_background`.

Step boundary log lines (e.g. `=== Step 2/5: normal — model_a on session_2024 ===`) are emitted by calling `_append_log` directly before each subprocess call, so the terminal output has clear section headers.

### 3. `GET /app/v0/inference/task/{taskId}` — Include Log Snapshot

Add a `logs` field to `InferenceTaskStatus` (the Python dataclass and the response) containing all lines captured so far. This lets the UI load existing log history when opening the dialog for an already-running task, with a single HTTP request before connecting to SSE:

```python
@dataclass
class InferenceTaskStatus:
    taskId: str
    status: str = InferenceStatus.PENDING
    completed: int | None = None
    total: int | None = None
    error: str | None = None
    message: str | None = None
    logs: List[str] = field(default_factory=list)
```

`_status_snapshot_dict` is updated to hydrate `logs` from `_get_logs(task_id)` before returning.

### 4. SSE Stream — Incremental Log Events

The current poller yields a plain `dict` that is always a status snapshot. We extend it to a **typed event envelope**:

```python
# event types
# { "type": "status", ...InferenceTaskStatus fields }
# { "type": "log", "lines": ["line1", "line2"] }
```

The SSE helper sends all events as `data: {json}\n\n` (no named SSE event types). The `type` field in the JSON distinguishes them. This keeps `EventSource.onmessage` as the sole handler.

Updated poller:

```python
def poller() -> Iterator[dict]:
    log_offset = 0
    terminal = {InferenceStatus.COMPLETED, InferenceStatus.FAILED, InferenceStatus.CANCELLED}

    # On connect, replay all logs so a late subscriber catches up
    initial_logs = _get_logs(task_id, 0)
    if initial_logs:
        yield {"type": "log", "lines": initial_logs}
        log_offset = len(initial_logs)

    while True:
        # Status snapshot
        snapshot = _status_snapshot_dict(task_id)
        snapshot["type"] = "status"
        yield snapshot

        # Incremental log lines since last poll
        new_lines = _get_logs(task_id, log_offset)
        if new_lines:
            yield {"type": "log", "lines": new_lines}
            log_offset += len(new_lines)

        if snapshot["status"] in terminal:
            # Final flush — any lines written after last poll
            final_lines = _get_logs(task_id, log_offset)
            if final_lines:
                yield {"type": "log", "lines": final_lines}
            break

        time.sleep(0.1)
```

**Note:** The `logs` field is intentionally omitted from `status` events in the SSE stream (it would be redundant — logs arrive via `log` events). The `logs` field on `InferenceTaskStatus` is only populated in the REST `GET /task/{taskId}` response.

### 5. Active Task Endpoint

Add a lightweight endpoint so the UI can discover whether there is an active task (e.g. after a page reload):

```
GET /app/v0/inference/task/active
```

**Response:**
```json
{ "taskId": "uuid-or-null" }
```

Returns the `taskId` of the most recently started task whose status is `PENDING` or `RUNNING`, or `null` if none exists. The backend finds this by iterating `_status_by_task` (under lock) for a non-terminal status entry.

---

## Frontend Changes

### 1. TypeScript Types

Extend `InferenceTaskStatus` with the log snapshot field:

```typescript
export interface InferenceTaskStatus {
  taskId: string;
  status: InferenceStatus;
  completed: number | null;
  total: number | null;
  error?: string | null;
  message?: string | null;
  logs?: string[];          // populated only in REST GET response
}
```

Add a discriminated union for SSE stream events:

```typescript
export type TaskStreamEvent =
  | ({ type: 'status' } & InferenceTaskStatus)
  | { type: 'log'; lines: string[] };
```

### 2. `session.service.ts`

**`streamTaskProgress`** changes signature from `Observable<InferenceTaskStatus>` to `Observable<TaskStreamEvent>`:

```typescript
streamTaskProgress(taskId: string): Observable<TaskStreamEvent> {
  const url = `/app/v0/inference/task/${taskId}/stream`;
  return new Observable<TaskStreamEvent>((subscriber) => {
    const es = new EventSource(url);
    const onMessage = (ev: MessageEvent) => {
      try {
        const event = JSON.parse(ev.data) as TaskStreamEvent;
        subscriber.next(event);
        if (event.type === 'status' &&
            (event.status === 'COMPLETED' || event.status === 'FAILED')) {
          es.close();
          subscriber.complete();
        }
      } catch {
        // ignore malformed events
      }
    };
    // ... same error/teardown handling
    es.onmessage = onMessage;
    es.onerror = onError;
    return () => { try { es.close(); } catch {} };
  });
}
```

**`getActiveInferenceTask`** — new method:

```typescript
async getActiveInferenceTask(): Promise<{ taskId: string | null }> {
  return firstValueFrom(
    this.httpClient.get<{ taskId: string | null }>('/app/v0/inference/task/active')
  );
}
```

**`getInferenceTaskStatus`** — new method (for fetching logs on reconnect):

```typescript
async getInferenceTaskStatus(taskId: string): Promise<InferenceTaskStatus> {
  return firstValueFrom(
    this.httpClient.get<InferenceTaskStatus>(`/app/v0/inference/task/${taskId}`)
  );
}
```

### 3. `TerminalOutputComponent` (new)

A standalone component that renders a scrollable terminal-style log view.

**Selector:** `app-terminal-output`

**Inputs:**
- `lines: string[]` — all log lines to display (append-only from parent)

**Behavior:**
- Renders lines in a `<pre>` or `<div>` with dark background, monospace font, fixed max-height (e.g. 300px), overflow-y scroll.
- Uses `AfterViewChecked` to auto-scroll to the bottom whenever `lines.length` increases. Tracks last-known length to avoid scrolling when lines haven't changed.
- If the user manually scrolls up, auto-scroll is suppressed until they scroll back to the bottom (track `isAtBottom` from `scroll` event on the container).

**File:** `web_ui/src/app/terminal-output/terminal-output.component.ts` (+ `.html`, `.css`)

### 4. `run-model-inference-dialog` Changes

**State additions:**

```typescript
protected taskId = signal<string | null>(null);
protected logLines = signal<string[]>([]);
```

**On dialog open (`ngOnInit`):**

1. Call `sessionService.getActiveInferenceTask()`.
2. If `taskId` is non-null, fetch `sessionService.getInferenceTaskStatus(taskId)` to get current status and existing log lines.
3. Pre-populate `logLines` with `status.logs`, set `inferState` from the status fields.
4. Subscribe to `sessionService.streamTaskProgress(taskId)` to receive further events — same handler as `startInference` (see below).

This handles the "dialog opened while task is already running" case.

**`startInference` — updated stream subscription:**

The `next` handler now dispatches on `event.type`:

```typescript
const sub = this.sessionService.streamTaskProgress(taskId).subscribe({
  next: (event: TaskStreamEvent) => {
    if (event.type === 'log') {
      this.logLines.update(lines => [...lines, ...event.lines]);
    } else {
      // event.type === 'status'
      const total = event.total ?? 0;
      const completed = event.completed ?? 0;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      const status =
        event.status === 'COMPLETED' ? 'done'
        : event.status === 'FAILED'  ? 'error'
        : 'running';
      this.inferState.set({ status, progress, message: event.message ?? undefined, error: event.error ?? undefined });
    }
  },
  // ... same error/complete handlers
});
```

**Template additions:**

- Show `<app-terminal-output [lines]="logLines()">` whenever `inferState().status` is `'running'`, `'done'`, or `'error'` (i.e. once inference has started or is active). Hide it while `status === 'idle'` and no reconnected task exists.
- The existing progress bar and message label remain; the terminal sits below them.

**`model-inference-dialog.component.ts`** — the same `streamTaskProgress` subscriber update applies here (dispatch on `event.type`). The terminal component is also added to this dialog's template. No reconnect logic needed here (this dialog is per-model, shorter-lived).

---

## Data Flow Summary

```
subprocess stdout/stderr
        │
        ▼ (threads, line-by-line)
_logs_by_task[taskId]  (append-only List[str], protected by _logs_lock)
        │
        ├──► GET /inference/task/{id}  →  logs: [...all lines so far...]
        │
        └──► GET /inference/task/{id}/stream (SSE)
                  │
                  ├── on connect: { type: 'log', lines: [...all prior lines] }
                  ├── every 100ms: { type: 'status', ...snapshot }
                  └── when new lines: { type: 'log', lines: [...new lines] }
                            │
                            ▼
                  streamTaskProgress() Observable<TaskStreamEvent>
                            │
                  ┌─────────┴──────────┐
                  │                    │
              type=status          type=log
                  │                    │
           inferState signal     logLines signal
                  │                    │
           progress bar        <app-terminal-output>
```

---

## Files to Modify / Create

| File | Change |
|---|---|
| `app_server/src/litpose_app/routes/inference.py` | Add `_logs_by_task`, `_append_log`, `_get_logs`, `_run_subprocess_with_logging`; update subprocess calls; add `logs` field to `InferenceTaskStatus`; update `poller()` to emit typed events; add `GET /inference/task/active` |
| `web_ui/src/app/session.service.ts` | Add `TaskStreamEvent` type; change `streamTaskProgress` return type; add `getActiveInferenceTask`, `getInferenceTaskStatus` |
| `web_ui/src/app/terminal-output/terminal-output.component.ts` | New component |
| `web_ui/src/app/terminal-output/terminal-output.component.html` | New template |
| `web_ui/src/app/terminal-output/terminal-output.component.css` | New styles |
| `web_ui/src/app/run-model-inference-dialog/run-model-inference-dialog.component.ts` | Add `taskId`, `logLines` signals; add reconnect logic in `ngOnInit`; update stream subscriber to dispatch on event type |
| `web_ui/src/app/run-model-inference-dialog/run-model-inference-dialog.component.html` | Add `<app-terminal-output>` below progress bar |
| `web_ui/src/app/model-inference-dialog/model-inference-dialog.component.ts` | Update stream subscriber to dispatch on event type |
| `web_ui/src/app/model-inference-dialog/model-inference-dialog.component.html` | Add `<app-terminal-output>` below progress bar |

---

## Edge Cases and Notes

- **Log growth**: For long inference runs with many sessions, logs can grow large. The in-memory list is unbounded for now. A future enhancement could cap at N lines per task and add a `truncated: true` flag.
- **SSE late subscriber / log replay**: The poller sends all prior log lines in a single `{ type: 'log', lines: [...] }` event on connect, before entering the polling loop. This ensures a dialog opened mid-task sees full history immediately.
- **`GET /task/active` race**: If two tasks are started concurrently (possible but unusual), the endpoint returns the most recently started non-terminal task. This is a best-effort heuristic and sufficient for the current single-user use case.
- **`logs` in `GET /task/{id}` vs SSE**: The REST response includes logs for the reconnect case (load history + status in one round-trip before subscribing to SSE). SSE `status` events do **not** include `logs` to avoid sending large payloads on every 100ms poll tick.
- **stderr prefix**: EKS and litpose scripts may write progress to stderr. Prefixing stderr lines with `[stderr] ` makes it easy for users to distinguish them from stdout in the terminal view. The prefix can be styled differently (e.g. amber color) in the terminal component.
