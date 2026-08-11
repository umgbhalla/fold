#!/bin/bash
# Acceptance-path A/B: CPU burned by the SHIPPED BINARY per character of output,
# on an identical prompt, at a transcript size where the row fix matters.
#
# The deterministic fixture bench (tui:bench) proved the render path got
# cheaper, but it drives TuiApp directly rather than the binary a user runs.
# This drives the binary, end to end, against a real model.
#
#   bun run tui:bench:live ~/.local/bin/foldcode after 14
#   bun run tui:bench:live /tmp/foldcode-old     before 14
#
# It normalises by characters produced, because generation speed varies between
# runs by more than the effect being measured: raw CPU alone rewards a run where
# the model happened to emit less, which is what made a first attempt at this
# comparison reverse itself between repeats.
#
# Read the result with the transcript size in mind. The dominant fix scales with
# rendered rows, so a 14-turn session (about 30 rows) shows roughly 6% here while
# tui:bench shows 17% at the same row count and about 2x at 300 rows. The
# difference is real work this harness includes and the fixture does not:
# network, model, and tokenizer time.
set -u
BIN="$1"
NAME="$2"
TURNS="${3:-14}"
DIR="/tmp/foldacc-$NAME"
rm -rf "$DIR"; mkdir -p "$DIR"; cd "$DIR" || exit 1
git init -q .

termctrl stop "$NAME" >/dev/null 2>&1
termctrl start "$NAME" --host opentui --cols 160 --rows 44 --cwd "$DIR" -- "$BIN" >/dev/null 2>&1
sleep 4
termctrl send "$NAME" ctrl-n >/dev/null 2>&1; sleep 2
termctrl send "$NAME" enter  >/dev/null 2>&1; sleep 2
termctrl send "$NAME" enter  >/dev/null 2>&1; sleep 2
termctrl send "$NAME" down enter >/dev/null 2>&1; sleep 2
termctrl send "$NAME" down enter >/dev/null 2>&1; sleep 2
termctrl send "$NAME" enter  >/dev/null 2>&1; sleep 3

PID=$(pgrep -f "$BIN" | tail -1)
[ -z "$PID" ] && { echo "$NAME: no process"; exit 1; }

# Build a transcript so the row count is realistic.
for i in $(seq 1 "$TURNS"); do
	termctrl send "$NAME" "text:say the number $i then one short sentence about it" enter >/dev/null 2>&1
	sleep 6
done

to_s() { echo "$1" | awk -F: '{ if (NF==3) print $1*3600+$2*60+$3; else print $1*60+$2 }'; }
cpu0=$(to_s "$(ps -o time= -p "$PID" | tr -d ' ')")

# One long streaming turn, sampled while it runs so output volume is known.
termctrl send "$NAME" "text:write a 2000 word essay on the history of operating systems, prose only, no tools" enter >/dev/null 2>&1
sleep 40

cpu1=$(to_s "$(ps -o time= -p "$PID" | tr -d ' ')")
# Total characters the model produced this turn, read from the session log so a
# scrolled-off transcript still counts.
CHARS=$(python3 - "$DIR" <<'PY'
import json,sys,os,glob
slug='private'+sys.argv[1].replace('/','-')
base=os.path.expanduser('~/.fold/sessions')
cands=[d for d in glob.glob(os.path.join(base,'*')) if os.path.basename(sys.argv[1]) in d]
total=0
for d in cands:
	for f in glob.glob(os.path.join(d,'sess_*.jsonl')):
		for line in open(f):
			line=line.strip()
			if not line: continue
			try: e=json.loads(line)
			except Exception: continue
			if e.get('_tag')=='assistant-message':
				content=(e.get('message') or {}).get('content')
				# Content is either a plain string or a list of typed parts.
				if isinstance(content,str):
					total+=len(content)
				elif isinstance(content,list):
					for part in content:
						if isinstance(part,dict) and part.get('type')=='text':
							total+=len(part.get('text',''))
print(total)
PY
)
cpu=$(echo "$cpu1 $cpu0" | awk '{printf "%.2f", $1-$2}')
echo "$NAME: CPU ${cpu}s over 40s, ${CHARS} chars produced, $(echo "$cpu $CHARS" | awk '{if ($2>0) printf "%.3f", $1*1000/$2; else print "n/a"}') ms CPU per char"
termctrl stop "$NAME" >/dev/null 2>&1
