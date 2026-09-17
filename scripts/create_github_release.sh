#!/usr/bin/env bash
# Create a GitHub Release for the version already recorded in
# app_server/pyproject.toml. Does not bump the version.
#
# Prerequisites:
#   - Version + README notes committed and pushed to origin/main
#   - gh authenticated with permission to create releases
#
# Usage (from anywhere):
#   ./scripts/create_github_release.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not logged in. Run: gh auth login" >&2
  exit 1
fi

# --- Version from pyproject.toml (you set this; the script never increments) ---
VERSION="$(python - <<'PY'
import tomllib
from pathlib import Path
path = Path("app_server/pyproject.toml")
print(tomllib.loads(path.read_text())["project"]["version"])
PY
)"

if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: version '${VERSION}' is not X.Y.Z.W (LP version X.Y.Z + LPA increment W)." >&2
  exit 1
fi

TAG="v${VERSION}"
echo "Project version: ${VERSION}"
echo "Git tag:         ${TAG}"

# --- Guardrails ---
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree is not clean. Commit or stash first." >&2
  git status --short
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${BRANCH}" != "main" ]]; then
  echo "ERROR: must be on main (currently '${BRANCH}')." >&2
  exit 1
fi

git fetch origin main --tags

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [[ "${LOCAL}" != "${REMOTE}" ]]; then
  echo "ERROR: local main is not in sync with origin/main." >&2
  echo "  local:  ${LOCAL}"
  echo "  remote: ${REMOTE}"
  echo "Pull/push until they match, then re-run." >&2
  exit 1
fi

NOTES_FILE="$(mktemp)"
trap 'rm -f "${NOTES_FILE}"' EXIT

python - "${VERSION}" "${NOTES_FILE}" <<'PY'
import re
import sys
from pathlib import Path

version, out_path = sys.argv[1], sys.argv[2]
text = Path("README.md").read_text()
# Headings look like: ### [2.3.0.3] — 2026-08-27
heading = re.compile(
    rf"^### \[{re.escape(version)}\](?:\s+[—–-].*)?\s*$",
    re.MULTILINE,
)
match = heading.search(text)
if not match:
    sys.exit(
        f"ERROR: README.md has no notes heading '### [{version}]'. "
        "Add that section before releasing."
    )
start = match.end()
nxt = re.search(r"^### \[", text[start:], re.MULTILINE)
body = text[start : start + nxt.start() if nxt else None]
# Keep the heading as the first line of the GitHub release notes.
notes = text[match.start() : match.end()] + body
notes = notes.strip() + "\n"
Path(out_path).write_text(notes)
print(f"Found README notes ({len(notes.splitlines())} lines).")
PY

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  EXISTING_SHA="$(git rev-parse "${TAG}^{commit}")"
  if [[ "${EXISTING_SHA}" != "${LOCAL}" ]]; then
    echo "ERROR: tag ${TAG} already exists and points at ${EXISTING_SHA}, not HEAD." >&2
    echo "Refusing to move the tag." >&2
    exit 1
  fi
  echo "Tag ${TAG} already exists locally and points at HEAD."
else
  git tag -a "${TAG}" -m "lightning-pose-app ${TAG}"
  echo "Created annotated tag ${TAG}."
fi

if git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "Tag ${TAG} already exists on origin."
else
  git push origin "refs/tags/${TAG}"
  echo "Pushed ${TAG} to origin."
fi

if gh release view "${TAG}" >/dev/null 2>&1; then
  echo "ERROR: GitHub Release ${TAG} already exists. Not overwriting." >&2
  exit 1
fi

gh release create "${TAG}" \
  --title "${TAG}" \
  --notes-file "${NOTES_FILE}"

echo
echo "GitHub Release ${TAG} created."
echo "PyPI publish is triggered by that release (see .github/workflows/publish.yml)."
echo "Watch: https://github.com/paninski-lab/lightning-pose-app/actions"
