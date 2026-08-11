# A resumed session can write a sequence the log will not reload

Found by resuming a real session in the shipped binary, not by any test: the
fixtures all describe well-formed logs, so nothing in the suite could see this.

## Symptom

`foldcode --resume sess_nlvcx59jspmv9nbtouplqux1` refuses to open the session:

```
EventLogCorruptEntryError: Invalid EventLog sequence at line 58: expected 57, got 28
    at packages/fold-agent/src/EventLog/JsonlLayer.ts:38
```

The session is permanently unopenable. It still lists in the picker, with its
title and turn count, so the failure only appears on the way in.

## What the log contains

`~/.fold/sessions/Users-umang-hub-fold/sess_nlvcx59jspmv9nbtouplqux1.jsonl`,
61 lines, written across two runs:

```
line 57  seq=56  14:46:03  session_title     <- last entry of the first run
line 58  seq=28  14:59:48  user-message      <- first entry after resuming
line 59  seq=29  15:00:00  assistant-message
line 60  seq=30  15:00:00  agent-finished
line 61  seq=31  15:00:05  session_title
```

The sequence runs 0..56, then restarts at 28 and counts up again. There is a
thirteen-minute gap at the seam, so the second block is a resume of the same
session file.

`JsonlLayer.ts:74` requires `entry.seq === lineNumber - 1`, so the reader
rejects line 58 and the whole session with it. Exactly four lines mismatch,
which is the four lines written after the resume.

The counter appears to have been restored from something other than the end of
the file: 28 is the seq of line 29, the first entry of the previous run's final
turn. That points at the resume path seeding the counter from a turn boundary
rather than from the newest entry, but I have not confirmed which code does it.

## Not caused by the rail work

`git diff a81fe89 HEAD -- packages/fold-agent/ packages/fold-core/` is empty:
the rail commits touched only `fold-cli`. `JsonlLayer.ts` is unchanged since
`ad42d8b`, and the affected session was written at 15:00 today by the previous
binary.

## Two separable defects

1. **The writer** puts a non-monotonic seq in the file on resume. This is the
   actual bug and needs the resume path traced.
2. **The reader** treats it as fatal for the entire session. Even once the
   writer is fixed, every log already written this way stays unopenable, and
   the entries are individually well-formed and ordered by timestamp. Worth
   deciding whether a sequence that only goes backwards at a resume seam should
   cost the user the whole conversation.

## Reproducing

```sh
foldcode --resume sess_nlvcx59jspmv9nbtouplqux1   # in /Users/umang/hub/fold
```

Any log whose seq is not exactly its line index minus one reproduces the read
side.
