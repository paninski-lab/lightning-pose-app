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

`litpose run_app` is production-shaped (compiled UI). Use `--host 0.0.0.0` on cloud machines; run `./scripts/build/build_ui.sh` first.

## Tests

Before calling work done: backend `cd app_server && pytest --ignore=tests/test_predict_wrapper.py`; for UI you touched, `cd web_ui && npx ng lint` and targeted `npx ng test`.

## Tools

Do not install or enable additional tools unless asked.
