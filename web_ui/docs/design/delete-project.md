# Design Document: Delete Project Feature

## Overview
This feature allows users to delete projects directly from the home page. Following the pattern of model deletion, it will include a confirmation dialog to prevent accidental data loss. Users can choose to either just unregister the project or also permanently delete all associated files on disk.

## User Experience (UI/UX)
- **Delete Button**: A "trash" icon or "Delete" button will appear on each project card on the `HomePage`.
- **Hover Effect**: The button will be hidden by default and only revealed when the user hovers over the project card.
- **Confirmation Dialog**: Clicking the delete button will open a modal dialog asking the user to confirm the deletion.
- **Confirmation Mechanism**:
    - A clear warning message explaining the action.
    - A checkbox: "Also delete all project files from disk (data directory and model directory)". This is unchecked by default.
    - A mandatory confirmation checkbox: "I want to delete this project".
    - The "Delete Permanently" button becomes active only after the mandatory confirmation is checked.
- **Feedback**: A toast notification will appear after successful deletion.

## Frontend Implementation

### 1. `ProjectInfoService`
Add a `deleteProject` method to handle the RPC call to the backend.

```typescript
// web_ui/src/app/project-info.service.ts
async deleteProject(projectKey: string, removeFiles: boolean) {
  return this.rpc.call('deleteProject', { projectKey, removeFiles });
}
```

### 2. `ProjectDeleteDialogComponent`
Create a new component `ProjectDeleteDialogComponent`.

- **Input**: `projectKey: string`, `dataDir: string`, `modelDir?: string`
- **Output**: `done: EventEmitter<boolean>`
- **Template**: A modal (using DaisyUI `modal` classes) with:
    - Warning message explaining that unregistering removes it from the app, and deleting files is permanent.
    - Checkbox for `removeFiles`.
    - Mandatory checkbox for confirmation.
    - "Cancel" and "Delete Permanently" buttons.

### 3. `HomePageComponent`
- **Template**:
    - Add a delete button to the project card (absolute positioned, shown on `group-hover`).
    - Add the `app-project-delete-dialog` component, triggered by a signal.
- **Logic**:
    - Handle opening the dialog and refreshing the project list on success.
    - Use `ToastService` to show success/error messages.

## Backend Implementation

### 1. `DeleteProjectRequest` Schema
Define the request body in `app_server/src/litpose_app/routes/project.py`.

```python
class DeleteProjectRequest(BaseModel):
    projectKey: str
    removeFiles: bool = False
```

### 2. `deleteProject` Endpoint
Add a new RPC endpoint in `app_server/src/litpose_app/routes/project.py`.

```python
@router.post("/app/v0/rpc/deleteProject")
def delete_project(
    request: DeleteProjectRequest,
    project_util: ProjectUtil = Depends(deps.project_util),
) -> None:
    # 1. Get project paths before unregistering if we need to remove files
    if request.removeFiles:
        paths = project_util.get_all_project_paths().get(request.projectKey)
        if paths:
            if paths.data_dir and os.path.exists(paths.data_dir):
                shutil.rmtree(paths.data_dir)
            if paths.model_dir and os.path.exists(paths.model_dir):
                shutil.rmtree(paths.model_dir)

    # 2. Unregister project from projects.toml
    project_util.update_project_paths(request.projectKey, None)
```

## Testing
### Backend Unit Tests
Create `app_server/tests/routes/test_project_delete.py`:
- Test unregistering only: verify `projects.toml` entry is gone, but files remain.
- Test unregistering + file removal: verify `projects.toml` entry is gone AND directories are deleted.
- Test with non-existent project key: ensure it handles it gracefully or returns 404.

## Security & Safety
- **Path Validation**: Ensure that the `projectKey` exists.
- **Deletion Safety**: Check that paths are within expected boundaries before `shutil.rmtree` (though `ProjectPaths` usually contains absolute paths managed by the app).
