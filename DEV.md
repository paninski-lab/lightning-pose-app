# Maintainer notes

How we **build wheels**, **cut GitHub Releases**, and **publish to PyPI**. Everyday contributor setup (conda, Node, honcho, lint, PRs) is in [CONTRIBUTING.md](CONTRIBUTING.md). Architecture: [CLAUDE.md](CLAUDE.md).

## Scripts

| Script | Purpose |
|--------|---------|
| [`scripts/build/build_ui.sh`](scripts/build/build_ui.sh) | `ng build` → `app_server/src/litpose_app/ngdist/` (gitignored). Needed for `litpose run_app` from a clone. |
| [`scripts/build/build_wheel.sh`](scripts/build/build_wheel.sh) | Runs `build_ui.sh`, then `python -m build` in `app_server`. Writes `app_server/dist/*.whl`. Does **not** tag or talk to GitHub. |
| [`scripts/publish_github_release.sh`](scripts/publish_github_release.sh) | From a clean **`main`**: tags `vX.Y.Z.W` and creates a **GitHub Release** using the matching section in [CHANGELOG.md](CHANGELOG.md). That event triggers [`.github/workflows/publish.yml`](.github/workflows/publish.yml) (PyPI). |

PyPI CI also calls `build_ui.sh` so the published wheel includes the compiled UI.

## Production-shaped run (clone)

After Node deps are installed (`cd web_ui && npm install`):

```bash
./scripts/build/build_ui.sh
litpose run_app
# cloud VMs: litpose run_app --host 0.0.0.0
```

If `ngdist` is missing, uvicorn still starts the API but the browser will not get `index.html`.

## Version numbers

**`X.Y.Z.W`:** `X.Y.Z` is the lightning-pose version this app release is built for; `W` is this app’s increment for that LP version, starting at `0`.

Canonical version: `app_server/pyproject.toml` (`[project].version`). Git tags: `vX.Y.Z.W`.

## Cutting a release

1. Confirm lightning-pose on the machine (or in the release notes) matches the `X.Y.Z` you intend.
2. On a **feature branch**:
   - Set `[project].version` in `app_server/pyproject.toml`.
   - Add a heading at the **top** of [CHANGELOG.md](CHANGELOG.md):

     `### [X.Y.Z.W] — YYYY-MM-DD`

   - Describe user-facing and development changes as needed.
3. Land that on **`origin/main`** (PR for version + changelog is typical).
4. From a **clean** `main` matching `origin/main`:

   ```bash
   git checkout main && git pull origin main
   ./scripts/publish_github_release.sh
   ```

Requires the `gh` CLI, logged in with permission to create releases on this repo.

Do **not** run the publish script from a feature branch. Merging a version bump does **not** publish; only creating the GitHub Release does.

If the tag or GitHub Release already exists, the script refuses to overwrite.

### After publish

- Watch [Actions](https://github.com/paninski-lab/lightning-pose-app/actions) for the PyPI workflow.
- Optional: install in a **separate venv** (not the editable clone) with `pip install lightning-pose-app==X.Y.Z.W` and run `litpose run_app` to smoke-test what users get.

## Local wheel without publishing

```bash
pip install build
./scripts/build/build_wheel.sh
# then, in a clean venv:
pip install app_server/dist/*.whl
```

Use this to test the packaged UI before tagging.
