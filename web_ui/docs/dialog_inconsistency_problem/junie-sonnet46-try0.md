# Dialog Audit: Affirmative Action Buttons

Audited on: 2026-04-02

This document captures the current state of every dialog's affirmative action button(s) — their loading state, disabled state, and UX pattern on success — and flags all discrepancies.

---

## Summary Table

| Dialog | Button label | Loading spinner | Disabled while loading | Disabled until valid | On success |
|---|---|---|---|---|---|
| Bundle Adjust — Run | Run | ✅ inside button | ✅ | n/a | Stays open; shows results inline |
| Bundle Adjust — Save | Save | ✅ inside button | ✅ (also disabled after success) | n/a | Stays open; shows inline success text; user must click Close |
| Create Model | Create | ❌ none | ❌ | ✅ (`[class.btn-disabled]`) | Emits `done(modelName)`; parent closes |
| Extract Frames | Extract frames | ⚠️ spinner outside button | ✅ | ✅ | Emits `done(targetKey)`; parent closes |
| Model Inference — Import | Import (upload + transcode) | ⚠️ spinner outside button | ✅ | ✅ (`allValid`) | Dialog stays open; user proceeds to Run inference |
| Model Inference — Run inference | Run inference | ❌ none (progress bar shown separately) | ✅ (`inferenceRunning`) | ✅ (`allTranscoded`) | Stays open; inline progress/badge shown |
| Project Delete | Delete permanently / Remove | ❌ none | ❌ | ❌ | Emits `done(true)`; parent closes |
| Model Delete | Delete Permanently | ❌ none | ❌ | ✅ (confirmation checkbox) | Emits `done(true)`; parent closes |
| Model Rename | Rename model | ❌ none | ❌ | ✅ (form validity) | Emits `done(true)`; parent closes |
| Error Dialog | Close | n/a (dismiss only) | n/a | n/a | Closes via `mat-dialog-close` |

---

## Per-Dialog Detail

### 1. Bundle Adjust Dialog (`bundle-adjust-dialog`)

Two affirmative buttons in sequence.

**"Run" button**
- Loading spinner: ✅ `<span class="loading loading-spinner loading-sm">` rendered *inside* the button, conditionally on `baLoading()`.
- Disabled while loading: ✅ `[disabled]="baLoading()"`.
- On success: Dialog stays open. Results table and a second "Save" button appear inline below.

**"Save" button** (appears after Run completes)
- Loading spinner: ✅ inside button, conditionally on `baSaving()`.
- Disabled while loading: ✅ `[disabled]="baSaving() || baSavingSuccess()"` — also stays disabled after success to prevent double-save.
- On success: Inline `<p class="text-success">Saved successfully. You can exit the dialog.</p>` appears. Dialog does **not** close automatically; user must click the separate "Close" button.

**Notes:** This is the most complete implementation. The "stays open + inline success message + manual close" pattern is intentional here because the user may want to review the results.

---

### 2. Create Model Dialog (`create-model-dialog`)

**"Create" button**
- Loading spinner: ❌ **None.** `onCreateClick()` is `async` and awaits two network calls (`getYamlFile` / `getDefaultYamlFile`, then `createTrainingTask`) with no loading indicator.
- Disabled while loading: ❌ **None.** The button can be clicked multiple times during the async operation.
- Disabled until valid: ✅ Uses `[class.btn-disabled]="!form.valid"` — note this uses a CSS class, not the `[disabled]` attribute, so it does not prevent click events from firing.
- On success: Shows a toast, then emits `done(modelName)`. Parent is responsible for closing.

**Discrepancies:**
- No loading state at all on an async operation.
- `[class.btn-disabled]` instead of `[disabled]` means the button is not truly disabled — click events still fire when the form is invalid.
- Double-submit is possible.

---

### 3. Extract Frames Dialog (`extract-frames-dialog`)

Multi-step wizard. Only the final step ("settings") has an affirmative action.

**"Extract frames" button** (step 3 of 3)
- Loading spinner: ⚠️ **Present but outside the button.** The spinner `<span class="loading loading-spinner loading-sm">` is a sibling element rendered just before the button, not inside it. This is inconsistent with the bundle-adjust pattern where the spinner is inside the button.
- Disabled while loading: ✅ `[disabled]="!settingsStepIsValid() || isProcessing()"`.
- On success: Emits `done(targetKey)`. Parent closes the dialog. No inline success message.
- On error: `isProcessing` is reset in `.finally()`, but there is no error display in the dialog — errors would surface only via the global error handler.

**"Continue" buttons** (steps 1 and 2)
- These advance the wizard locally (no async work), so no loading state is needed. ✅

**Discrepancy:**
- Spinner placement is outside the button, inconsistent with the established pattern.

---

### 4. Model Inference Dialog (`model-inference-dialog`)

Two affirmative buttons with distinct roles.

**"Import (upload + transcode)" button**
- Loading spinner: ⚠️ **Present but outside the button.** A `<span class="loading loading-spinner loading-sm">` is rendered as a sibling just before the button, not inside it.
- Disabled while loading: ✅ `[disabled]="!allValid() || uploading()"`.
- On success: Dialog stays open. The user is then expected to click "Run inference".

**"Run inference" button**
- Loading spinner: ❌ **None inside or near the button.** Progress is shown in a separate section above the footer (a `<progress>` bar + percentage text + status badge). The button itself gives no visual feedback that it was clicked.
- Disabled while loading: ✅ `[disabled]="!allTranscoded() || inferenceRunning()"`.
- On success: Inline `<span class="badge badge-success">Inference completed</span>` appears in the progress section. Dialog stays open; user closes manually.

**Discrepancies:**
- Import spinner is outside the button (inconsistent with bundle-adjust).
- "Run inference" has no spinner on or near the button itself; the progress section is visually separated and may not be immediately obvious as feedback for the button click.
- No `done.emit()` or auto-close on inference completion — the dialog just stays open with a success badge. The user must click "Close" manually, but there is no explicit success message prompting them to do so (unlike bundle-adjust's "Saved successfully. You can exit the dialog.").

---

### 5. Project Delete Dialog (`project-delete-dialog`)

**"Delete permanently" / "Remove" button**
- Loading spinner: ❌ **None.**
- Disabled while loading: ❌ **None.** `handleDelete()` is `async` with no guard against double-clicks.
- Disabled until valid: ❌ **None.** The button is always clickable regardless of state. (Note: there is an unused `deleteConfirmation` signal in the component that is never wired to the button — the checkbox in the HTML binds to `removeFiles`, not `deleteConfirmation`.)
- On success: Shows a toast, emits `done(true)`. Parent closes. On error, also emits `done(true)` — meaning the dialog closes even on failure.

**Discrepancies:**
- No loading state on a destructive async operation — the most critical gap in the codebase.
- Double-submit is possible.
- `deleteConfirmation` signal is declared but never used (dead code); the button has no confirmation gate.
- On error, `done.emit(true)` is called (same as success), which closes the dialog — the user loses context about what happened beyond the toast.

---

### 6. Model Delete Dialog (`model-delete-dialog`)

**"Delete Permanently" button**
- Loading spinner: ❌ **None.**
- Disabled while loading: ❌ **None.** `handleDelete()` is `async` with no guard.
- Disabled until valid: ✅ `[disabled]="!deleteConfirmation()"` — requires the user to check a confirmation checkbox first.
- On success: Shows a toast, emits `done(true)`. Parent closes. No error handling — if `deleteModel()` throws, the error propagates uncaught (no try/catch, no toast for failure).

**Discrepancies:**
- No loading state on a destructive async operation.
- Double-submit is possible (user could click rapidly before the async resolves).
- No error handling: an exception from `sessionService.deleteModel()` is unhandled in the component.

---

### 7. Model Rename Dialog (`model-rename-dialog`)

**"Rename model" button**
- Loading spinner: ❌ **None.**
- Disabled while loading: ❌ **None.** `handleRename()` is `async` with no guard.
- Disabled until valid: ✅ `[disabled]="newModelName.invalid"`.
- On success: Shows a toast, emits `done(true)`. Parent closes. No error handling — if `renameModel()` throws, the error propagates uncaught.

**Discrepancies:**
- No loading state on an async operation.
- Double-submit is possible.
- No error handling in the component.

---

### 8. Error Dialog (`error-dialog`)

This dialog is informational only. Its single button is "Close" (`mat-dialog-close`), which dismisses the Angular Material dialog. There is no affirmative action to audit.

---

## Consolidated Discrepancy List

| # | Issue | Affected dialogs |
|---|---|---|
| 1 | **No loading spinner** on async affirmative button | Create Model, Project Delete, Model Delete, Model Rename |
| 2 | **No disabled-while-loading** guard (double-submit possible) | Create Model, Project Delete, Model Delete, Model Rename |
| 3 | **Spinner rendered outside the button** (inconsistent placement) | Extract Frames, Model Inference (Import button) |
| 4 | **`[class.btn-disabled]` instead of `[disabled]`** (click events still fire) | Create Model |
| 5 | **No error handling** in component (failures are silent or crash) | Model Delete, Model Rename |
| 6 | **`done.emit(true)` on both success and error** (dialog closes even on failure) | Project Delete |
| 7 | **Dead code**: unused `deleteConfirmation` signal | Project Delete |
| 8 | **No auto-close or explicit "you can close" prompt** after inference completes | Model Inference |
| 9 | **No confirmation gate** on a destructive action | Project Delete (the checkbox controls file deletion scope, not confirmation) |

---

## Recommended Patterns (for reference)

**Gold standard (bundle-adjust "Save" button):**
```html
<button
  class="btn btn-primary"
  [disabled]="isSaving() || saveSuccess()"
  (click)="handleSave()"
>
  @if (isSaving()) {
    <span class="loading loading-spinner loading-sm"></span>
  }
  Save
</button>
@if (saveSuccess()) {
  <p class="text-success">Saved successfully. You can exit the dialog.</p>
}
```

Key properties of the gold standard:
1. Spinner is **inside** the button.
2. Button is disabled via `[disabled]` (not `[class.btn-disabled]`) during loading **and** after success.
3. Inline success message tells the user what to do next.
4. The dialog does not close automatically when the result is worth reviewing; it closes automatically when there is nothing left to review.

