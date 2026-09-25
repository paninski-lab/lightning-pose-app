# Maintainer notes

How we **build wheels**, **cut GitHub Releases**, and **publish to PyPI**, plus setup that is specific to this team's machines. Everyday contributor setup (conda, Node, honcho, lint, PRs) is in [CONTRIBUTING.md](CONTRIBUTING.md). Architecture: [CLAUDE.md](CLAUDE.md).

## Lightning Studio

On our [Lightning Studio](https://lightning.ai/), a new shell (including the first shell after the Studio wakes) puts **Node 22** on `PATH` and may define `node`, `npm`, and `npx` as shell functions. Sleep does not uninstall Node 26 or `web_ui/node_modules`. It only drops the shell setup.

Do this in **each terminal** that will run UI commands. One terminal does not fix the others. `lpa-dev` (in `~/bin`, loaded as a shell function from `~/.zshrc`; not part of the repo) is the shortcut. After `~/.zshrc` changes, open a new terminal or run `source ~/.zshrc` once.

- `lpa-dev setup` selects Node 26 in **this** terminal and clears the `node` / `npm` / `npx` functions. It does not start the app. Use it before Storybook, `./scripts/build/build_ui.sh`, lint, or tests. `node -v` should print `v26…`.
- `lpa-dev run` starts honcho (same as `lpa-dev` with no command). Node 26 applies to that process only; other terminals still need `lpa-dev setup`.
- `lpa-dev kill` stops a dev or packaged app that is already running (honcho, `ng serve`, uvicorn, `litpose run_app`).

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

Between releases, that version is the next app increment plus `.dev0` (for example `2.4.2.1.dev0`). The `.dev0` stays fixed; it is not a counter. It sorts after the previous release and before the next one (`2.4.2.0` < `2.4.2.1.dev0` < `2.4.2.1`). `publish_github_release.sh` rejects a `.dev0` version, so merging it does not create a release.

The release change removes `.dev0` and renames the changelog heading from `### [X.Y.Z.W.dev0]` to `### [X.Y.Z.W] — YYYY-MM-DD`. Only then can the publish script tag it.

## Cutting a release

1. Confirm lightning-pose on the machine (or in the release notes) matches the `X.Y.Z` you intend.
2. On a **feature branch**:
   - In `app_server/pyproject.toml`, remove `.dev0` so `[project].version` is `X.Y.Z.W`.
   - In [CHANGELOG.md](CHANGELOG.md), rename `### [X.Y.Z.W.dev0]` to `### [X.Y.Z.W] — YYYY-MM-DD`. If there is no dev heading, add that dated heading at the top.
   - Describe user-facing and development changes as needed. For each behavior change, name the test that covers it (spec or pytest file, and what it checks).
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
