#!/bin/bash
# Build the host binary and install it to ~/.local/bin/foldcode.
#
# The `rm` is not redundant. Copying over the path of a binary that is running,
# or has run recently, reuses the inode and macOS kills the result on exec with
# SIGKILL ("Killed: 9") because the code signature no longer matches the pages
# it has cached. Removing first gives the new binary a fresh inode.
set -euo pipefail
cd "$(dirname "$0")/../../.."

VERSION="${1:-0.1.0-dev}"
TARGET="${FOLDCODE_INSTALL_PATH:-$HOME/.local/bin/foldcode}"

bun run scripts/build/binaries.ts --host --version "$VERSION"

mkdir -p "$(dirname "$TARGET")"
rm -f "$TARGET"
cp dist/fold-darwin-arm64/bin/foldcode "$TARGET"

# Prove the installed copy runs, not just the one in dist.
"$TARGET" --version
