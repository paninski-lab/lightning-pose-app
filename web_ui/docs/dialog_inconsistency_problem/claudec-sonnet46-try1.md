# Dialog Affirmative Button Audit

**Date:** 2026-04-02  
**Scope:** All dialog components in `web_ui/src/app/`  
**Focus:** Affirmative action buttons — loading states and success UX patterns

---

## Dialogs Audited

### 1. Extract Frames Dialog
**Path:** `src/app/labeler/extract-frames-dialog/`  
**Affirmative button:** "Extract frames" (final step of multi-step flow)  
**Action:** RPC call to extract frames from a video session; can target a new or existing label file.

**Loading state:**
- Signal: `isProcessing` (boolean)
- Button is disabled: `[disabled]="!settingsStepIsValid() || isProcessing()"`
- Spinner shown: `<span class="loading loading-spinner loading-sm">` when `isProcessing()` is true
- All inputs are also disabled during processing

**On success:**
- Emits `done` output with the target label file key
- Dialog does NOT close itself — parent is responsible for closure
- Loading state reset via `.finally()`

---

### 2. Model Delete Dialog
**Path:** `src/app/models-page/model-delete-dialog/`  
**Affirmative button:** "Delete Permanently"  
**Action:** Permanently deletes the model directory (config, weights, outputs).

**Loading state:**
- **None.** Button is disabled only based on a confirmation checkbox: `[disabled]="!deleteConfirmation()"`
- No spinner, no disabled-during-request behavior

**On success:**
- Shows toast: `'Successfully deleted model'`
- Emits `done(true)`
- Dialog closes itself via `closeDialog()` (calls `.close()` on `HTMLDialogElement`)

**Discrepancy:** No loading feedback during the async delete operation. User cannot tell if the request is in-flight.

---

### 3. Model Rename Dialog
**Path:** `src/app/models-page/model-rename-dialog/`  
**Affirmative button:** "Rename model"  
**Action:** Renames the model in the filesystem.

**Loading state:**
- **None.** Button disabled only on form validity: `[disabled]="newModelName.invalid"`
- No spinner, no disabled-during-request behavior

**On success:**
- Shows toast: `'Successfully renamed model'`
- Emits `done(true)`
- Dialog closes itself via `closeDialog()`

**Discrepancy:** No loading feedback during the async rename operation.

---

### 4. Bundle Adjust Dialog
**Path:** `src/app/bundle-adjust-dialog/`  
**Affirmative buttons:** Two sequential buttons — "Run" then "Save"

**"Run" button:**
- Signal: `baLoading` (boolean)
- Button disabled: `[disabled]="baLoading()"`
- Spinner shown during loading
- On success: shows a results comparison table; "Save" button becomes available
- Dialog does NOT close itself after Run

**"Save" button:**
- Signal: `baSaving` (boolean)
- Button disabled: `[disabled]="baSaving() || baSavingSuccess()"`
- Spinner shown during save; button stays disabled after success
- On success: shows inline message `'Saved successfully. You can exit the dialog.'`
- Dialog does NOT auto-close — user must manually click "Close"

**Notes:** Both phases have loading states. The two-phase workflow is explicit and clear. User is instructed to close manually rather than auto-closing.

---

### 5. Create Model Dialog
**Path:** `src/app/create-model-dialog/`  
**Affirmative button:** "Create" (final step of multi-step flow)  
**Action:** Generates a YAML config and creates a model training task.

**Loading state:**
- **None.** Button disabled only by form validity: `[class.btn-disabled]="!form.valid"`
- No spinner, no disabled-during-request behavior

**On success:**
- Shows toast: `'Successfully created model training task'`
- Emits `done` with the model name
- Dialog does NOT auto-close — parent handles closure

**Discrepancy:** No loading feedback during YAML generation or task creation. No error UI — errors are likely swallowed silently.

---

### 6. Model Inference Dialog
**Path:** `src/app/model-inference-dialog/`  
**Affirmative buttons:** Two sequential buttons — "Import (upload + transcode)" then "Run inference"

**"Import" button:**
- Signal: `uploading` (from `VideoImportStore`)
- Button disabled: `[disabled]="!allValid() || uploading()"`
- Spinner shown: `aria-label="Importing"`
- On success: shows toast, **auto-closes the dialog**
- On failure: shows error toast

**"Run inference" button:**
- Signal: `inferenceRunning` (boolean)
- Button disabled: `[disabled]="!allTranscoded() || inferenceRunning()"`
- Progress bar shown: `<progress [value]="inference().progress" max="100">` with percentage text and status messages (uses SSE)
- On success: shows `'Inference completed'` badge in-dialog; dialog does NOT auto-close

**Discrepancy:** Import auto-closes on success, but Run inference does not — inconsistent success behavior within the same dialog.

---

### 7. Project Delete Dialog
**Path:** `src/app/home-page/project-delete-dialog/`  
**Affirmative button:** "Delete permanently" / "Remove" (label changes based on a "remove files" checkbox)  
**Action:** Removes project from registry; optionally deletes all project files from disk.

**Loading state:**
- **None.** No disabled state on the button at all.
- No spinner, no loading feedback

**On success:**
- Shows success toast with project key
- Emits `done(true)`
- Dialog closes itself via `closeDialog()`

**On error:**
- Shows error toast
- Also emits `done(true)` — parent cannot distinguish success from failure

**Discrepancies:**
1. No loading feedback during the async delete operation.
2. `done(true)` emitted on both success and error — ambiguous signal to parent.

---

### 8. Session Import Dialog
**Path:** `src/app/session-import/`  
**Affirmative button:** "Import"  
**Action:** Uploads and transcodes video files sequentially.

**Loading state:**
- Signal: `uploading` (from `VideoImportStore`)
- Button disabled: `[disabled]="!allValid() || uploading()"`
- Spinner shown: `aria-label="Importing"`

**On success:**
- Auto-closes dialog when `allTranscoded()` is true and no errors (via constructor effect)
- Shows toast: `'Import successful'`
- Emits `done` output

**On partial failure:**
- Shows inline message: `'Some tasks failed. Click Import to retry.'`
- Does not auto-close; user can retry

**Notes:** Good pattern — auto-close on full success, in-place retry on partial failure.

---

### 9. Error Dialog
**Path:** `src/app/error-dialog/`  
**Only button:** "Close" — informational dialog, no affirmative action.  
Not relevant to this audit.

---

## Summary Table

| Dialog | Loading spinner | Button disabled during load | On success: dialog closes | Closes itself or parent? |
|---|---|---|---|---|
| Extract Frames | Yes | Yes | No (parent handles) | Parent |
| Model Delete | **No** | **No** | Yes | Itself |
| Model Rename | **No** | **No** | Yes | Itself |
| Bundle Adjust — Run | Yes | Yes | No (manual close) | Manual |
| Bundle Adjust — Save | Yes | Yes | No (manual close) | Manual |
| Create Model | **No** | **No** | No (parent handles) | Parent |
| Model Inference — Import | Yes | Yes | **Yes (auto-close)** | Itself |
| Model Inference — Run | Progress bar | Yes | No (stays open) | N/A |
| Project Delete | **No** | **No** | Yes | Itself |
| Session Import | Yes | Yes | Yes (auto-close) | Itself |

---

## Discrepancies

### Missing loading states (high severity)
These dialogs perform async operations but provide zero visual feedback — no spinner, and the button is not disabled while the request is in-flight:
- **Model Delete**
- **Model Rename**
- **Create Model**
- **Project Delete**

Risk: user may double-click; user has no confirmation the click was registered.

### Inconsistent success behavior within a single dialog
- **Model Inference Dialog:** The Import phase auto-closes the dialog on success. The Run Inference phase does not auto-close. These two phases sit side-by-side in the same dialog yet behave differently on completion.

### Ambiguous done() value
- **Project Delete Dialog:** Emits `done(true)` on both success and error. The parent cannot tell whether the deletion succeeded.

### Inconsistent close responsibility
Dialogs close themselves OR delegate to the parent with no apparent rule:
- Close themselves: Model Delete, Model Rename, Project Delete, Model Inference (Import phase), Session Import
- Parent closes: Extract Frames, Create Model
- Neither (manual): Bundle Adjust

### No error UI in Create Model
Errors during model creation appear to be swallowed (no toast, no inline message). Other dialogs at minimum show an error toast.
