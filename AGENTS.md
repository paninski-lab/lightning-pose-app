# Agent instructions — Lightning Pose App

This is the Cursor/agent entry point. Stack and code patterns: [CLAUDE.md](CLAUDE.md). Setup, lint, and releases: [development.md](development.md).

## Product

Lightning Pose App (LPA) is research software used by 100+ labs for labeling, training, and reviewing pose estimation. Goals: **powerful, easy to use, robust**. Prefer boring, reversible changes. Do not ship cleverness that can corrupt a user’s project.

## Safety

The filesystem is the database (`~/.lightning-pose/projects.toml`, `project.yaml`, label CSVs, model dirs). Do not silently rewrite those formats. New on-disk layouts need a numbered migration in `app_server/src/litpose_app/migrations/`. If a change could lose labels or models, stop and explain.

## Git

- Work on a short-lived branch from `main` (see [development.md](development.md)). Do not push `main`.
- Commit, open, merge, or close PRs **only when asked**.
- Version bump + README notes land via PR. After merge, release from `main` with `./scripts/publish_github_release.sh`. Do not tag or release from a feature branch.

## Dev loop

```bash
honcho -f Procfile.dev start   # UI at http://localhost:4200, hot reload
```

`litpose run_app` is production-shaped (compiled UI). Use `--host 0.0.0.0` on cloud machines; run `./scripts/build/build_ui.sh` first.

## Tests

Before calling work done: backend `cd app_server && pytest --ignore=tests/test_predict_wrapper.py`; for UI you touched, `cd web_ui && npx ng lint` and targeted `npx ng test`.

## Tools

Propose extra tools (CI, bots, git config, e2e in Actions). Do not install or enable them unless asked.
