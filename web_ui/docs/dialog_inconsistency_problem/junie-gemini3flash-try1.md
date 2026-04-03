# Dialog UX Audit: Loading States and Success Patterns

This document captures the current state of affirmative action buttons in dialogs across the application, identifying discrepancies in loading indicators and success behaviors.

## Audit Summary

Most dialogs in this project use a custom implementation (DaisyUI/Tailwind + raw HTML `<dialog>` tag) rather than `MatDialog`. There is significant inconsistency in how loading states are handled and how dialogs are closed upon success.

### Component Breakdown

| Dialog Component | Affirmative Action | Loading State Indicator | Success Behavior | Dialog Type |
| :--- | :--- | :--- | :--- | :--- |
| `ExtractFramesDialog` | "Extract frames" | Loading spinner in button; button disabled. | Emits `done(targetKey)`; Parent expected to close. | Custom `<dialog>` |
| `ModelDeleteDialog` | "Delete Permanently" | **None**. Button disabled until checkbox checked. | Emits `done(true)`; Parent expected to close. | Custom `<dialog>` |
| `ModelRenameDialog` | "Rename" | **None**. | Emits `done(true)`; Parent expected to close. | Custom `<dialog>` |
| `BundleAdjustDialog` | "Optimize" / "Save" | Loading spinner in button (`baLoading`/`baSaving`). | State updated; "Saved" success signal. Manual close. | Custom `<dialog>` |
| `CreateModelDialog` | "Create" | **None** (async but no UI flag). Button disabled if invalid. | Emits `done(modelName)`; Parent expected to close. | Custom `<dialog>` |
| `ModelInferenceDialog` | "Import" / "Run" | Spinner *next to* button (Import only). | UI updates (Status: 'done'). Manual close. | Custom `<dialog>` |
| `ProjectDeleteDialog` | "Delete Permanently" | **None**. | Emits `done(true)`; Parent expected to close. | Custom `<dialog>` |
| `ProjectSettings` | "Save" / "Create" | **None**. | Shows "Saved" msg; auto-emits/closes after 1.5s. | Custom `<dialog>` |
| `SessionImport` | "Import" | Spinner next to button. | **Auto-closes** on success + Toast message. | Custom `<dialog>` |
| `ErrorDialog` | "Close" | N/A | Closes via `mat-dialog-close`. | `MatDialog` |

## Identified Discrepancies

### 1. Implementation Strategy
- **MatDialog vs. Custom**: `ErrorDialog` is the only one using `@angular/material/dialog`. All others use raw HTML `<dialog>` with DaisyUI classes (`modal`, `modal-box`, `modal-action`).
- **Control**: Some dialogs are managed by signals/inputs from parents (`ExtractFramesDialog`), while others use native ID-based opening (`BundleAdjustDialog`).

### 2. Loading State Visualization
- **In-Button Spinner**: `ExtractFramesDialog` and `BundleAdjustDialog` show a spinner *inside* the affirmative button.
- **External Spinner**: `ModelInferenceDialog` and `SessionImport` show a spinner *to the left* of the action buttons.
- **Missing Loading State**: `ModelDeleteDialog`, `ModelRenameDialog`, `ProjectDeleteDialog`, and `CreateModelDialog` perform async operations but provide no visual "processing" feedback on the button itself.

### 3. Success UX & Closure Pattern
- **Parent-Controlled**: Most dialogs emit a `done` or `output` signal, and the parent is responsible for destroying/closing the component.
- **Auto-Closing**: `SessionImport` is the only one that closes itself automatically (via `effect`) when the background task finishes successfully.
- **Delayed Auto-Closing**: `ProjectSettings` shows a "Saved" message and then auto-closes after a 1.5s timeout.
- **Manual Closure Required**: `BundleAdjustDialog` and `ModelInferenceDialog` require the user to manually click "Close" after the operation completes.

### 4. SUCCESS Feedback
- **Toast Notifications**: Used by `ModelDeleteDialog`, `ModelRenameDialog`, `CreateModelDialog`, `ProjectDeleteDialog`, and `SessionImport`.
- **In-Dialog Messages**: `BundleAdjustDialog` (success flag) and `ProjectSettings` ("Saved" text).
- **Silent**: `ExtractFramesDialog` relies on the parent's reaction to the `done` event.
