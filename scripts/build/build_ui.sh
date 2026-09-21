#!/bin/bash
####
# Compile the Angular UI into app_server for production serving / wheel building.
# For the development server, use `honcho -f Procfile.dev start` instead.
####

# Exit immediately if a command fails.
set -e

# --- Change to the repo root (POSIX-compliant method) ---
# This ensures that relative paths work correctly, no matter where the script
# is called from or which shell is used (sh, bash, zsh, etc.).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}/web_ui"

DESTINATION="${REPO_ROOT}/app_server/src/litpose_app/ngdist/ng_app"

npx ng build \
  --output-path="$DESTINATION" \
  --deploy-url="/static/"

echo "✅ Build complete!"
