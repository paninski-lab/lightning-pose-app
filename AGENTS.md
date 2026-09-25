# Agent instructions — Lightning Pose App

This is the Cursor/agent entry point. Stack and code patterns: [CLAUDE.md](CLAUDE.md). Human setup: [CONTRIBUTING.md](CONTRIBUTING.md). Releases: [DEV.md](DEV.md).

## Product

Lightning Pose App (LPA) is research software used by 100+ labs for labeling, training, and reviewing pose estimation. 

## Safety

The filesystem is the database (`~/.lightning-pose/projects.toml`, `project.yaml`, label CSVs, model dirs). Do not silently rewrite those formats. New on-disk layouts need a numbered migration in `app_server/src/litpose_app/migrations/`. If a change could lose labels or models, stop and explain.

## Git

- Commit, push, open, merge, or close PRs **only when asked**.
- Typical code changes like new features and bug fixes should happen on devoted branches, not `main`. One branch per feature or bugfix bundle; combining is fine when the changes touch the same part of the code. (See [CONTRIBUTING.md](CONTRIBUTING.md)).
- Simple docs-only edits (README, CHANGELOG, CONTRIBUTING, DEV) may be made on `main`.
- Version bump + CHANGELOG.md notes: after they are on `main`, release with `./scripts/publish_github_release.sh`. Do not tag or release from a feature branch.

## Dev loop

```bash
honcho -f Procfile.dev start   # UI at http://localhost:4200, hot reload
```

`litpose run_app` is production-shaped (compiled UI). Use `--host 0.0.0.0` on cloud machines; run `./scripts/build/build_ui.sh` first. Honcho compiles the UI in memory and does not fill `ngdist`.

On this team's Lightning Studio, Node 26 is not the default shell. Use `lpa-dev` (`setup`, `run`, `kill`). Details are in [DEV.md](DEV.md), not in the public contributor guide.

## UI

DaisyUI 5 (`dim` in `web_ui/src/styles.css`) is the component style. Use DaisyUI classes before custom CSS. Put a widget in `web_ui/src/app/components/` when it is reused or has its own behavior, and add a `*.stories.ts` beside it. Leave feature-only UI next to the feature (for example `video-player/`). Do not wrap a one-off DaisyUI button in a new component. Storybook: `cd web_ui && npm run storybook` (http://localhost:6006), with Node 26 on `PATH`. Storybook is for looking at the widget. It does not replace unit tests.

The Viewer frame and time fields stay custom (`.jump-field`). DaisyUI `input` is too tall for that bar. The seek slider uses DaisyUI `range`.

## Tests

Write or update tests in the same change as the behavior. A UI change that renames a control, tip, or shortcut is not done until the spec asserts the current markup and behavior, not the old copy.

- Backend: `cd app_server && pytest --ignore=tests/test_predict_wrapper.py`. Skip `test_predict_wrapper.py` unless you mean to; it needs a GPU-oriented env and is excluded from CI.
- UI you touched: `cd web_ui && npx ng lint` and a targeted `npx ng test --no-watch --browsers=ChromeHeadless --include=<spec>`. Run the full UI suite when the change is shared (a component under `components/`, global styles, or keyboard/routing used by more than one page).
- Prefer specs next to the code (`*.spec.ts`). Assert what a user can do: clicks, keyboard, typed frame/time, slider bounds. Query by role or `aria-label`, and assert `data-tip` text when the tip is part of the change.
- Delete a spec that only covered a method which moved to a child. Do not keep a parent test alive with stubs for behavior the parent no longer owns. For a parent with heavy children, stub those children (`TestBed.overrideComponent`), as in `labeler-page.component.spec.ts`.
- Components that use `ProjectInfoService` must mock it. Do not let tests hit the real router resolver or RPC client.

When you describe the change in [CHANGELOG.md](CHANGELOG.md), [BUGS.md](BUGS.md), or a `feature_plans/*.md` note, name the test that covers it (file, and the behavior it checks). A user-facing bullet without a corresponding test note is incomplete.

## Tools

Do not install or enable additional tools unless asked.
