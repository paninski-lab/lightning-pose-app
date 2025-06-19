#!/bin/bash
####
# This script builds a release for pypi.
####

# Exit immediately if a command fails.
set -e

# --- Change to the script's directory (POSIX-compliant method) ---
# This ensures that relative paths work correctly, no matter where the script
# is called from or which shell is used (sh, bash, zsh, etc.).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "${SCRIPT_DIR}"

rm -rf app_server/dist
rm -rf app_server/src/litpose_app/ngdist

./build_ui.sh

cd app_server && python -m build .

echo "✅ Build complete!"
