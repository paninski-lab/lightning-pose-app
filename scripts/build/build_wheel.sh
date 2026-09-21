#!/bin/bash
####
# Compile the UI and build the PyPI wheel (app_server/dist/*.whl).
# Does not tag or create a GitHub Release; use scripts/publish_github_release.sh for that.
####

# Exit immediately if a command fails.
set -e

# --- Change to the repo root (POSIX-compliant method) ---
# This ensures that relative paths work correctly, no matter where the script
# is called from or which shell is used (sh, bash, zsh, etc.).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

rm -rf app_server/dist
rm -rf app_server/src/litpose_app/ngdist

"${REPO_ROOT}/scripts/build/build_ui.sh"

cd app_server && python -m build .

echo "✅ Build complete!"
