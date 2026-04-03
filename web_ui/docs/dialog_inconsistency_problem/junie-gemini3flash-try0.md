# Dialog Affirmative Action Button Audit

This document audits the current state of affirmative action buttons in dialogs across the `web_ui` project. The focus is on loading states, success UX patterns, and dialog closing behavior.

## Overview of Dialog Implementations

The project uses two main mechanisms for dialogs:
1.  **Native `<dialog>` with DaisyUI**: Used for almost all feature-related dialogs. These are typically controlled by a `Boolean` signal in the parent component or via direct DOM manipulation (`showModal()` / `close()`).
2.  **Angular Material `MatDialog`**: Only used for the `ErrorDialog`.

## Audit Results

| Dialog Component | Affirmative Action Button(s) | Loading State | Success UX Pattern | Closing Logic | Implementation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `BundleAdjustDialog` | "Run", "Save" | **Loading spinner** inside button; button disabled. | "Saved successfully" message in dialog. | Manual `.close()` call or `✕` button. | Native `<dialog>` |
| `CreateModelDialog` | "Create" | **None** (Async call, but no UI flag). Button disabled if form invalid. | None (closes immediately). | Emits `closeButtonClick`; parent removes from DOM. | Native `<dialog>` |
| `ExtractFramesDialog` | "Extract frames" | **Loading spinner** *above* button; button disabled. | None (closes immediately). | Emits `closeButtonClick`; parent removes from DOM. | Native `<dialog>` |
| `ModelInferenceDialog`| "Import", "Run inference" | **Loading spinner** *next to* button (Import only). | "Inference completed" badge + message. | Emits `done()`; parent removes from DOM. | Native `<dialog>` |
| `SessionImport` | "Import" | **Loading spinner** *next to* button. | **Toast message** ("Import successful"). | **Auto-closes** on success via `effect`. | Native `<dialog>` |
| `ModelDeleteDialog` | "Delete Permanently" | **None** (Async call awaited but no UI state). | **Toast message** ("Successfully deleted model"). | Emits `done(true)`; parent removes from DOM. | Native `<dialog>` |
| `ModelRenameDialog` | "Rename" | **None** (Async call awaited but no UI state). | **Toast message** ("Successfully renamed model"). | Emits `done(true)`; parent removes from DOM. | Native `<dialog>` |
| `ProjectDeleteDialog` | "Delete Permanently" | **None** (Async call awaited but no UI state). | **Toast message** + variant (success/error). | Emits `done(true)`; parent removes from DOM. | Native `<dialog>` |
| `ProjectSettings` | "Save" | **None**. Button disabled if form not dirty. | "Saved" message in footer (auto-clears). | Emits `closeButtonClick`; parent removes from DOM. | Native `<dialog>` |
| `ErrorDialog` | "Close" | N/A | N/A | Closes via `mat-dialog-close`. | `MatDialog` |

## Key Discrepancies & Issues

### 1. Inconsistent Loading States
- **Spinners**: Some use inline spinners (`BundleAdjust`), some use external spinners (`ModelInference`, `SessionImport`), and some use a spinner *above* the button (`ExtractFrames`).
- **Missing Loading UI**: Several async operations (`CreateModel`, `ModelDelete`, `ModelRename`, `ProjectDelete`) provide no visual feedback that a process is running, which can lead to double-clicks or user confusion.

### 2. Divergent Success Patterns
- **Toasts vs. In-Dialog Messages**: There is no standard for where success is reported. `SessionImport` uses a toast and auto-closes, while `BundleAdjust` shows a message and stays open.
- **Auto-close vs. Manual-close**: Some dialogs close immediately on success, while others require the user to acknowledge the success and click "Close".

### 3. State Management & Visibility
- **Event-driven vs. Direct-access**: Most dialogs emit an event for the parent to handle closure. However, `BundleAdjust` and `ModelInference` use direct DOM/ViewChild access to close themselves, creating different patterns for how dialogs are integrated.
- **Form-based Disabling**: `ProjectSettings` and `CreateModel` rely on form validity/dirty state for disabling, which is good, but they lack the "processing" disable state found in others.

### 4. Component Styles
- **Button Classes**: Most use `btn-primary`, but some use `btn-secondary` or `btn-soft` variations without a clear semantic reason for the difference in "affirmative" action styling.
