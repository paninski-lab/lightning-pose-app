# Dialog Audit: Affirmative Action Buttons

Audited on: 2026-04-02

Covers every dialog's primary action button — loading state, disabled-while-loading guard, and on-success UX. Discrepancies are flagged per dialog and consolidated at the end.

---

## Summary Table

| Dialog | Button | Spinner | Disabled while loading | Success UX |
|---|---|---|---|---|
| Bundle Adjust — Run | Run | ✅ inside button | ✅ | Stays open; shows results + Save button inline |
| Bundle Adjust — Save | Save | ✅ inside button | ✅ (also post-success) | Inline "Saved successfully" message; user closes manually |
| Create Model | Create | ❌ | ❌ | Emits `done(modelName)`; parent closes |
| Extract Frames | Extract frames | ⚠️ sibling, outside button | ✅ | Emits `done(targetKey)`; parent closes; no in-dialog feedback |
| Model Inference — Import | Import (upload + transcode) | ⚠️ sibling, outside button | ✅ | Stays open; user proceeds to Run inference |
| Model Inference — Run inference | Run inference | ❌ (progress bar shown elsewhere) | ✅ | Inline badge + progress above footer; user closes manually; no "you can exit" prompt |
| Model Delete | Delete Permanently | ❌ | ❌ | Emits `done(true)`; parent closes; errors unhandled |
| Model Rename | Rename model | ❌ | ❌ | Emits `done(true)`; parent closes; errors unhandled |
| Project Delete | Delete permanently / Remove | ❌ | ❌ | Emits `done(true)` on success AND on error |
| Error Dialog | Close | n/a | n/a | `mat-dialog-close`; no async action |

---

## Per-Dialog Detail

### 1. Bundle Adjust (`bundle-adjust-dialog`)

Two sequential affirmative buttons.

**"Run" button**
- Spinner: ✅ inside the button, shown when `baLoading()`.
- Disabled while loading: ✅ `[disabled]="baLoading()"`.
- On success: dialog stays open; a results comparison table and a "Save" button appear inline below.

**"Save" button** (appears after Run completes)
- Spinner: ✅ inside the button, shown when `baSaving()`.
- Disabled while loading: ✅ `[disabled]="baSaving() || baSavingSuccess()"` — stays disabled after success to prevent double-save.
- On success: inline `<p class="text-success">Saved successfully. You can exit the dialog.</p>` appears; dialog does not auto-close; user clicks "Close" manually.

This is the most complete implementation in the codebase.

---

### 2. Create Model (`create-model-dialog`)

**"Create" button**
- Spinner: ❌ None. `onCreateClick()` is `async` and awaits two network calls (`getYamlFile`/`getDefaultYamlFile`, then `createTrainingTask`) with no loading indicator.
- Disabled while loading: ❌ None. Button can be clicked multiple times while the async operation is in flight.
- Disabled until valid: ⚠️ Uses `[class.btn-disabled]="!form.valid"` — a CSS class, not the `[disabled]` attribute. Click events still fire when the form is invalid, meaning `onCreateClick()` can be invoked with a bad form state.
- On success: shows a toast, emits `done(modelName)`; parent closes.

**Discrepancies:**
- No loading state on an async button.
- Double-submit is possible.
- `[class.btn-disabled]` does not prevent click events.

---

### 3. Extract Frames (`extract-frames-dialog`)

Multi-step wizard; only step 3 ("settings") has an affirmative action.

**"Extract frames" button**
- Spinner: ⚠️ Present, but rendered as a sibling element *before* the button — not inside it. Inconsistent with the bundle-adjust pattern.
- Disabled while loading: ✅ `[disabled]="!settingsStepIsValid() || isProcessing()"`. Back button and all radio/input controls are also disabled while processing.
- On success: emits `done(targetKey)`; parent closes. No in-dialog success message or feedback — the user receives no acknowledgment within the dialog that extraction completed.

**Discrepancy:**
- Spinner placement outside the button.
- No in-dialog success state.

---

### 4. Model Inference (`model-inference-dialog`)

Two sequential affirmative buttons.

**"Import (upload + transcode)" button**
- Spinner: ⚠️ Present as a sibling before the button, not inside it.
- Disabled while loading: ✅ `[disabled]="!allValid() || uploading()"`.
- On success: dialog stays open; user is expected to click "Run inference" next.

**"Run inference" button**
- Spinner: ❌ None on or near the button itself. Feedback is shown in a separate `<div>` above the footer containing a `<progress>` bar, percentage text, and a status badge — visually disconnected from the button.
- Disabled while loading: ✅ `[disabled]="!allTranscoded() || inferenceRunning()"`.
- On success: an `<span class="badge badge-success">Inference completed</span>` appears in the progress section. Dialog stays open; user must close manually. There is no explicit "you can exit" prompt (unlike bundle-adjust Save).

**Discrepancies:**
- Import spinner is outside the button.
- Run inference has no loading feedback on/near the button.
- No "you can close now" prompt after inference completes.

---

### 5. Model Delete (`model-delete-dialog`)

**"Delete Permanently" button**
- Spinner: ❌ None.
- Disabled while loading: ❌ None. `handleDelete()` is `async` with no in-flight guard.
- Disabled until valid: ✅ `[disabled]="!deleteConfirmation()"` — requires checking a confirmation checkbox first.
- On success: shows a toast, emits `done(true)`; parent closes.
- Error handling: ❌ None. If `sessionService.deleteModel()` throws, the exception propagates uncaught. No error toast, no recovery.

**Discrepancies:**
- No loading state on a destructive async operation.
- Double-submit possible (rapid clicks before the promise resolves).
- No error handling.

---

### 6. Model Rename (`model-rename-dialog`)

**"Rename model" button**
- Spinner: ❌ None.
- Disabled while loading: ❌ None. `handleRename()` is `async` with no guard.
- Disabled until valid: ✅ `[disabled]="newModelName.invalid"`.
- On success: shows a toast, emits `done(true)`; parent closes.
- Error handling: ❌ None. If `sessionService.renameModel()` throws, the exception propagates uncaught.

**Discrepancies:**
- No loading state on an async operation.
- Double-submit possible.
- No error handling.

---

### 7. Project Delete (`project-delete-dialog`)

**"Delete permanently" / "Remove" button** (label changes based on the `removeFiles` checkbox)
- Spinner: ❌ None.
- Disabled while loading: ❌ None. `handleDelete()` is `async` with no guard.
- Confirmation gate: ❌ None on the button. The component declares a `deleteConfirmation` signal but **it is never bound in the template** — it is dead code. The only checkbox in the template controls `removeFiles` (whether to also delete files from disk), not whether to proceed at all.
- On success: shows a success toast, then calls `done.emit(true)`.
- On error: shows an error toast, then **also calls `done.emit(true)`**. The parent receives the same signal on both success and failure; it cannot distinguish the two outcomes from the output alone.

**Discrepancies:**
- No loading state on a destructive async operation.
- Double-submit possible.
- `deleteConfirmation` signal is declared but never used — the button has no confirmation gate.
- `done.emit(true)` is called in both the success and catch branches, meaning the parent always dismisses the dialog even if the operation failed.

---

### 8. Error Dialog (`error-dialog`)

Informational display only. The single button is "Close" (`mat-dialog-close`). No async operation; nothing to audit for loading state or success UX.

---

## Consolidated Discrepancy List

| # | Issue | Affected dialogs |
|---|---|---|
| 1 | No loading spinner on an async affirmative button | Create Model, Model Delete, Model Rename, Project Delete |
| 2 | Button not disabled while async is in flight (double-submit possible) | Create Model, Model Delete, Model Rename, Project Delete |
| 3 | Spinner rendered as a sibling outside the button (inconsistent placement) | Extract Frames, Model Inference (Import) |
| 4 | `[class.btn-disabled]` instead of `[disabled]` — click events fire even when visually disabled | Create Model |
| 5 | No error handling in component — exceptions propagate uncaught, no error feedback | Model Delete, Model Rename |
| 6 | `done.emit(true)` called on both success and error — parent cannot distinguish outcomes | Project Delete |
| 7 | Dead code: `deleteConfirmation` signal declared but never bound in template | Project Delete |
| 8 | No confirmation gate on a destructive button (the checkbox controls scope, not confirmation) | Project Delete |
| 9 | No in-dialog success feedback after the primary action completes | Extract Frames, Model Inference (Run inference) |

---

## Reference: the gold standard

The bundle-adjust **Save** button is the most complete implementation:

```html
<button
  class="btn btn-primary"
  [disabled]="baSaving() || baSavingSuccess()"
  (click)="handleSaveClick()"
>
  @if (baSaving()) {
    <span class="loading loading-spinner loading-sm"></span>
  }
  Save
</button>
@if (baSavingSuccess()) {
  <p class="text-success">Saved successfully. You can exit the dialog.</p>
}
```

What it does right:
1. Spinner is **inside** the button.
2. `[disabled]` (not `[class.btn-disabled]`) prevents both visual and event-level interaction.
3. Button stays disabled after success to prevent double-submit.
4. Inline success message tells the user the operation is done and what to do next.
5. Dialog does not auto-close — the result is worth reviewing before dismissing.
