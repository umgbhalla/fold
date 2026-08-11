#!/bin/bash
# Deterministic measurement of the streaming render path: same token schedule,
# same row count, same fleet, no network. Reports CPU milliseconds burned across
# the streaming run and the average frame interval.
#
# A live A/B against a real model could not answer this: generation-speed
# variance between runs (1.7 s of CPU) was larger than the gap between builds.
#
#   bun run tui:bench .            my-change 300 300   # this checkout
#   bun run tui:bench /tmp/before  baseline  300 300   # a worktree to compare
#
# FOLD_BENCH_AGENTS and FOLD_BENCH_PER_AGENT size the subagent fleet; the
# whole-log projections do nothing without one, and a bench with no subagents
# reports the same number for every build.
set -u
# Accept either a repo root or the fold-cli package directory, since the script
# is run both from the package (via `bun run tui:bench .`) and against a
# comparison worktree given by its root.
ARG="$(cd "$1" && pwd)"
if [ -f "$ARG/test/fixtures/TuiStreamBenchFixture.tsx" ]; then
	PKG="$ARG"
elif [ -f "$ARG/packages/fold-cli/test/fixtures/TuiStreamBenchFixture.tsx" ]; then
	PKG="$ARG/packages/fold-cli"
else
	echo "no TuiStreamBenchFixture under $ARG" >&2
	exit 1
fi
NAME="$2"
ROWS="${3:-200}"
TOKENS="${4:-300}"
OUT="/tmp/fold-bench-$NAME.txt"

rm -f "$OUT"
termctrl stop "bench-$NAME" >/dev/null 2>&1
termctrl start "bench-$NAME" --host opentui --cols 160 --rows 44 --cwd "$PKG" -- \
	env FOLD_BENCH_ROWS="$ROWS" FOLD_BENCH_TOKENS="$TOKENS" FOLD_BENCH_OUT="$OUT" \
	bun --preload @opentui/solid/preload test/fixtures/TuiStreamBenchFixture.tsx >/dev/null 2>&1

for _ in $(seq 1 120); do
	[ -f "$OUT" ] && break
	sleep 1
done
termctrl stop "bench-$NAME" >/dev/null 2>&1
if [ -f "$OUT" ]; then echo "$NAME: $(cat "$OUT")"; else echo "$NAME: timed out"; fi
