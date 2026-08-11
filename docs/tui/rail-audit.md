# Right-rail audit: observed state, not speculation

> **Status: acted on.** Everything below is the state that was found. What was
> done about it is recorded in `## Outcome` at the end of this file.

Captured live via `termctrl` against `packages/fold-cli/test/fixtures/TuiAppFixture.tsx`
(the OpenTUI host), at 160x46 and 100x40, with `FOLD_TUI_EVENT_SUBAGENT_FIXTURE=1`.

## How to reproduce the live session

```sh
cd packages/fold-cli
export TERMCTRL_RUNTIME_DIR=/tmp/tcr && mkdir -p $TERMCTRL_RUNTIME_DIR
FOLD_TUI_EVENT_SUBAGENT_FIXTURE=1 termctrl start fold --host opentui --cols 160 --rows 46 \
  -- bun --preload @opentui/solid/preload test/fixtures/TuiAppFixture.tsx
termctrl wait fold "SUBAGENTS" --timeout 15000
termctrl show fold
# drive it: h/l move panes, tab cycles the rail, d toggles changes
termctrl send fold text:l
termctrl stop fold
```

Fixture env switches: `FOLD_TUI_EVENT_SUBAGENT_FIXTURE`, `FOLD_TUI_SUBAGENT_FIXTURE`,
`FOLD_TUI_OVERFLOW_SUBAGENTS_FIXTURE`, `FOLD_TUI_STOPPED_SUBAGENT_FIXTURE`.

## Prerequisite that was blocking all of this

`AgentId.make` / `MessageId.make` throw on a malformed id. `App.tsx` used
`AgentId.make('agent_root')` as the empty-log fallback and the fixtures used four
labels like `msg_system_root_...`; none pass the cuid check. Every terminal-control
spec died before first paint, so `bun run test:tui` had been fully red. Fixed in
`e5e1e71`. Any rail work must keep `bun run test:tui` green.

## Observed layout at 160 cols

```
┌─ EVENTS (32%) ──┐┌─ CONTEXT (40%) ──────────────┐╔═ META (28%) ═══════════╗
│ EVENTS  CHANGES ││ ★  SUBAGENT  {"agent":"rese  │║ SUBAGENTS  META  SKILLS ║
│▸ 6 ★ subagent   ││              archer",...}    │║┌─ STATUS ──────────────┐║
│                 ││                              │║│ ACT  ▂▂▄▂▄▂   2 tools │║
│                 ││                              │║│ CTX  —         latest │║
│                 ││                              │║│ COST —  1 agents · 2  │║
│                 ││                              │║│ RUN  ● 1 ◆ 0 ✕ 0      │║
│                 ││                              │║└───────────────────────┘║
│   ~30 dead rows ││       ~30 dead rows          │║┌─ AGENT TYPES ─────────┐║
│                 ││                              │║│  researcher  ████  1  │║
│                 ││                              │║└───────────────────────┘║
│                 ││                              │║┌─ TOOL CALLS 2 ────────┐║
│                 ││                              │║│ ★ subagent   ████  1  │║
│                 ││                              │║│ ✦ skill      ████  1  │║
│                 ││                              │║└───────────────────────┘║
│                 ││                              │║   ~24 dead rows         ║
└─────────────────┘└──────────────────────────────┘╚═════════════════════════╝
```

## Confirmed problems

1. **Fixed percentage widths regardless of content.** `App.tsx:256-262`:
   events 32%, rail 28%, context gets the remainder. A session with one event
   and no subagents still pays 28% for the rail. Below 84 cols the reader is
   the _smallest_ pane (events 40 / rail 26 / reader 34).

2. **The default rail tab is the one you cannot use.** `railTab` defaults to
   `'meta'`, and both `moveWithinPane` (`App.tsx:442-446`) and `jumpWithinPane`
   (`:468-472`) early-return for `meta`. J/K in the rail does nothing by default.

3. **STATUS is scalars in a pane.** ctx / cost / turns / agents / run-done-err
   are 4 lines of key-value that never need 28% of the width. The header's
   right column already renders session state and has room.

4. **The bars are not a chart.** `Bar` normalises against the max of the series,
   so a single agent type always renders a full 10-cell bar (`██████████ 1`).
   With one item per series the bar carries zero information.

5. **`MetricRow` animates over 8 frames at 35 ms on every count change**
   (`MetaRail.tsx:71-104`), one `setInterval` per row. That is a repaint storm
   in the busiest part of a live session, to tween integers that mostly go up by 1.

6. **Column budget is wasteful.** `MetricRow` spends 2 (glyph) + 12 (label) +
   10 (bar) + 3 (count) + 3 gaps = 30 cols to convey `subagent 1`.

7. **SKILLS is a modal task wearing a pane.** Select, press Enter, confirm Y/N.
   Nothing about it needs to be resident. It also always shows the _selected
   agent's_ skills, which is invisible from the rail itself.

8. **No stacked/expanding disclosure anywhere.** Highlighting a subagent shows
   the same two lines whether it is selected or not (`App.tsx:1244-1293`,
   fixed `height={2}`). The selected row cannot show what it actually is doing.

## Directions to evaluate (not decided)

- Collapse the rail to zero when it has nothing to say, giving the reader ~68%.
- Move STATUS scalars into the header; move SKILLS into `^K`.
- Stacked rendering: the highlighted rail row expands in place to show live
  tool, last output line, turns and elapsed; siblings stay one line.
- Replace normalised bars with something honest (share of total, or drop them).
- Density: a subagent row should fit status + type + age + activity in one line.

## Fixed-width column collapse (the "table" problem), verified live

Every rail row is a hand-rolled table of fixed-width `<text width={n}>` cells with
one `flexGrow` cell absorbing the remainder. When the pane is narrow the fixed
cells keep their width and the _meaningful_ cell is the one that collapses.

**Subagent row** (`App.tsx:1256-1289`): marker `width={2}` + gap + description
`flexGrow` + age `width={4}` + gap + `ActivityIndicator width={12}`. At 160 cols
(rail inner ~41) it reads:

```
▌  Overflow task 1      57y  ◓ RUNNING
general-purpose
```

At 100 cols (rail inner ~24) the description is squeezed to nothing:

```
▌     57y  ◓ RUNNING
general-purpose
```

The list becomes 15 identical rows. The only identifying field is the one that
collapsed, while 12 columns are still spent on the word `RUNNING` that is already
encoded in the spinner glyph and repeated in the `15 RUN` counter in the tab bar.

**Skills row** (`SkillsRail.tsx:55-81`): name and status are separate `<text>`
nodes with a `flexGrow` spacer and no reserved separator column, so they collide
at narrow widths exactly like the event summary did before `a81fe89`:

```
▸ effect-prograAVAILAB
· terminal-conAVAILABL
```

**Rail tab bar** (`App.tsx:1199-1220`): the three labels are fixed strings, so
they truncate to `SUBAGE MET SKILL` and the pane title vanishes entirely at 100
cols (the border renders as `╔════════╗` with no title text).

**Event index row** (`EventViews.tsx:324-384`): an 18-col gutter plus a 6-col
status column against a 30-col pane leaves about 6 columns of summary:
`▸   6 ★ subagent  {"age  run`.

The lesson for the redesign: fixed cells must yield before the identifying cell,
and any status already carried by a glyph should not also spend 12 columns on a
word.

## Also observed

- `relativeSubagentTime` renders `57y` for the fixture's `ts: 1`, because it
  measures against wall-clock `Date.now()` with no session epoch. Any log whose
  timestamps are not wall-clock produces nonsense ages.
- The header drops `· OFF` (the reasoning label) at 100 cols and the session id
  badge overlaps the pane border (`╚═sess_terminal_control  ╝`).

## Outcome

What was built, and where it is verified.

**New pure modules, unit tested.**

- `RowLayout.ts` — cells declare what they are worth, and optional ones are
  dropped whole, in priority order, before the subject gives up a column.
  `clampCell` cuts the middle rather than the tail, because the tail is what
  discriminates (`Overflow task 1` vs `Overflow task 12`).
- `SubagentActivity.ts` — what an agent is doing, from its own entries. Pairs
  tool calls to results by id, so an agent that finished ten `bash` runs does
  not claim to be running one. Split into `subagentScan` (log) and
  `activityFromScan` (clock) so a tick does not rescan every log.
- `PaneLayout.ts` — character widths, not percentages. Rail is 44 columns at
  ≥140, 30 at 110-139, absent below 110, and absent with no subagents. The
  focused pane then takes a fifth of each neighbour, so moving into a pane moves
  the layout rather than relabelling a border; floors keep the panes you are not
  in readable, and the three always sum to exactly the terminal.
- `SessionScalars.ts` — the header's scalar line and the rail's tool tally. A
  scalar with nothing to say is omitted, not rendered as an em dash, because a
  placeholder reads as a value at a glance.
- `SubagentRowText.ts` — the row's text, apart from the component that draws it,
  so which glyph a status gets and what survives at 26 columns are pinned by
  tests rather than only by captured frames.
- `Navigation.ts` — `movePane` walks only the panes on screen; `reconcilePane`
  recovers when the rail vanishes under the cursor.

**Rail.** One line per subagent; the selected row expands in place to show
turns, tools, whether a tool is running and for how long, and the result or
failure reason. Measured against the overflow fixture at 160x40: fifteen agents
plus the selected one's stats line plus the tally occupy seventeen rows. The old
rail spent two rows per agent, so the same fifteen cost thirty and the second row
carried only the agent's type.

**META is gone.** Its four scalars are one line in the header, its histograms
are one tally line at the foot of the rail, and `MetaRail.tsx` is deleted. The
rail is two tabs, both navigable, so J/K always does something. The bars are
gone with the panel; while they existed they were corrected to share-of-total,
because normalising against the largest member drew a full bar for any
single-item series.

**Correctness fixes found by driving it.** Invalid branded ids crashed the app
on any empty-log render and killed every fixture. A working subagent was
reported as idle, because it emits nothing while a tool runs. A row growing at
the bottom edge pushed its own detail lines out of view. The footer promised ESC
would leave the session when it would only deselect an agent.

**Feedback loop.** `bun run tui:sheet` renders a named fixture state at several
widths in one pass. `bun run test:tui` was 5 of 13 and is now 13 of 13; it had
been fully red because the fixtures crashed before first paint.

Two of the bugs above were found only by driving the shipped binary against a
real recorded session, and one was in the tooling itself: `tui:sheet` typed key
names as literal text, so `--keys d,enter` typed `e n t e r` and made working
behaviour look broken. A tool that lies about what it pressed is worse than no
tool, so named keys are pressed now.
