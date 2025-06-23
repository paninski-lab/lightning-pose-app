#!/bin/bash
####
# This script compiles the UI and puts it in app_server for production serving / pip wheel building.
# For development server, use `honcho -f Procfile.dev start` instead of this script.
####

# Exit immediately if a command fails.
set -e

# --- Change to the script's directory (POSIX-compliant method) ---
# This ensures that relative paths work correctly, no matter where the script
# is called from or which shell is used (sh, bash, zsh, etc.).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "${SCRIPT_DIR}/web_ui"

# --- Define the destination directory ---
# This is where the 'ng build' command will place the final output.
DESTINATION="../app_server/src/litpose_app/ngdist/ng_app"

ng build \
  --output-path="$DESTINATION" \
  --deploy-url="/static/"

echo "✅ Build complete!"
