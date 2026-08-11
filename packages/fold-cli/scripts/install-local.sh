#!/bin/bash
# Build the host binary and install it to ~/.local/bin/foldcode.
#
# The `rm` before the `cp` is defensive, and the honest version of why:
# a plain in-place `cp` over this path once produced `Killed: 9` on the very
# next exec, and `rm` + `cp` fixed it immediately. Later attempts to reproduce
# that failure on demand did not, including with changed binary content, so the
# exact trigger is not established. The usual explanation is macOS invalidating
# a code signature when a cached inode's pages change underneath it.
#
# Keeping the `rm` costs nothing and removes a failure mode that is confusing
# when it does hit: the binary looks installed and dies without output.
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
