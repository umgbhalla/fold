# Right-rail density proposal: hierarchy, stacked rows, bars, adaptive width

Design-only. Verified live via termctrl (`rail-density` session, stopped) against
`TuiAppFixture.tsx` with `FOLD_TUI_EVENT_SUBAGENT_FIXTURE=1 FOLD_TUI_OVERFLOW_SUBAGENTS_FIXTURE=1`
(14 overflow subagents + 1 researcher = 15 agents) at 160x46, 120x40, 100x40, 80x40, and
`FOLD_TUI_STOPPED_SUBAGENT_FIXTURE=1` for the DONE state.

## New evidence from driving the TUI (beyond rail-audit.md)

At 160x46 with 15 running agents the SUBAGENTS tab renders each agent as 2 lines,
where line 2 is only the type:

```
║ ▌  Inspect t...get input57y  ◓ RUNNING    ║
║ researcher                                ║
```

Three concrete failures visible in the captures:

- **Age collides with description.** The `width={4}` age column ("57y" in the fixture)
  butts against the truncated description with no separator: `Overflow task 157y`,
  `Ove...sk 157y`. At 120 cols "Overflow task 1" and "Overflow task 10" are
  indistinguishable (`Ove...sk 1` both).
- **At 100 cols the description is fully gone**: rows render as `▌     57y  ◓ RUNNING` -
  15 identical rows, only the alternating type line differs. The rail costs 26% of the
  screen to say nothing.
- **At 80 cols everything loses**: tabs crush to `SUBA MET SKI`, META bars overflow the
  panel border, and CONTEXT (the pane you read) is ~25 cols wide wrapping
  "WAITING FOR ROOT-AGENT OUTPUT".
- The type line burns 50% of the vertical budget: 15 agents × 2 = 30 rows to convey
  15 statuses + 8/7 type split.

## 1. Information hierarchy

**Resident (always visible while a session is live):** the subagent fleet, one line per
agent: status, identity (description), staleness (age / idle time). This is the only rail
content that changes second-to-second and drives an action (steer, interrupt, focus).
The overflow capture proves it: with 15 agents this list is the whole story of the session,
and everything else in the rail (STATUS scalars, bars) was static noise around it.

**Glanceable (one line, not a panel):**

- Fleet tally `● 15 ◆ 0 ✕ 0` - it already lives in the rail header (`15 RUN`); extend that
  slot to all three counts and delete the RUN row from STATUS.
- CTX %, COST, turns - these are 4 scalars that changed zero times during the capture.
  Move to the app header right column, which renders `SESSION ◒ 15 RUNNING` /
  `default · default · unresolved · OFF` and has a full empty line of room at every width
  tested. Delete the STATUS panel.
- ACT sparkline: delete. It maps entry `_tag` to 3 fixed heights - it is a texture, not data.

**On-demand:**

- SKILLS → a `^K` command ("Inject skill…"). The capture shows a full pane whose only
  interaction is select + Enter + Y/N, and whose agent scope is invisible. Modal task,
  modal surface. The SKILLS tab dies.
- AGENT TYPES / TOOL CALLS histograms → die as panels (see §3).
- A subagent's live tool, last output, prompt → the expanded selected row (§2), with
  Enter still focusing the full transcript in CONTEXT (already works).

Net: the rail becomes a single-purpose SUBAGENTS list. Tabs go away entirely, which also
fixes audit problem 2 (default tab is the J/K-dead META tab).

## 2. Stacked / expanding rendering

Rule: every row is 1 line. The selected row expands **in place** to a fixed budget:
**4 lines running, 3 lines done, 4 lines error**. Vertical math at the worst captured case
(14 agents, 40-row terminal, ~34 rail body rows): 13 siblings + 4 expanded = 17 rows.
Current rendering needs 28 rows and says less.

Data available per `SubagentView` (Subagents.ts): `description`, `prompt`, `type`,
`status`, `calledAt`, `turns`, `tools`, and crucially `entries` (the agent's full
`LogEntry[]`), from which the expanded row derives:

- **live tool**: last `assistant-message` tool-call part → name + one-line params summary
  (same summarisation the events pane already does)
- **last output**: last `tool-result` entry, or last assistant text line
- **idle time**: `now - entries.at(-1).ts` - the "is it stuck" signal nothing shows today
- **result / failure reason**: the `agent-finished` entry's `resultText` / `reason` / `outcome`

### 40 inner columns (rail ≥ 44 wide, the ≥140-col breakpoint)

Collapsed sibling (1 line - status glyph colored by status, desc flexGrow+truncate,
type abbreviated to 4 chars in `agentTypeAccent`, age right-aligned, `·` gap fixes
the collision bug):

```
◐ Overflow task 12             rsch · 4m
◆ Overflow task 3              genp · 6m
✕ Overflow task 7              rsch · 2m
```

Expanded RUNNING (4 lines):

```
▸ ◐ Overflow task 12        researcher
    3 turns · 12 tools · 4m · idle 8s
    ⚙ bash  bun run test --filter tui
    └ 42 pass 0 fail  test/TuiTermin…
```

Line 2 = `turns`/`tools`/`calledAt`/last-entry ts. Line 3 = live tool. Line 4 = last
output line. `idle 8s` renders in alert color past a threshold (e.g. 60s).

Expanded DONE (3 lines):

```
▸ ◆ Overflow task 12        researcher
    3 turns · 12 tools · done in 4m
    └ "Found the race in Subagents.t…"
```

Line 3 = `agent-finished.resultText`, first line, quoted.

Expanded ERROR (4 lines):

```
▸ ✕ Overflow task 12        researcher
    3 turns · 12 tools · failed at 4m
    ✕ AgentId.make: malformed id 'age…
    └ last: ⚙ bash  bun test  (exit 1)
```

Line 3 = `reason`/`resultText` from `agent-finished`. Line 4 = last tool before death.

### 26 inner columns (rail 30 wide, the 110-139 breakpoint)

Collapsed sibling (type abbrev drops, glyph color still carries type is wrong - status
owns the glyph color, type gets a 1-char colored tick after the selector):

```
◐ Overflow task 12       4m
◆ Overflow task 3        6m
```

Expanded RUNNING (4 lines):

```
▸ ◐ Overflow task 12
  rsch · 3t · 12⚒ · idle 8s
  ⚙ bun run test --filter…
  └ 42 pass 0 fail
```

Expanded DONE (3 lines):

```
▸ ◆ Overflow task 12
  rsch · 3t · 12⚒ · 4m
  └ "Found the race in Su…"
```

Expanded ERROR (4 lines):

```
▸ ✕ Overflow task 12
  rsch · 3t · 12⚒ · fail 4m
  ✕ AgentId.make: malform…
  └ ⚙ bun test  exit 1
```

Implementation note: this is a `height={selected ? N : 1}` swap plus `<Show>` on the
extra lines - no scroll gymnastics beyond the existing `scrollChildIntoView`.

## 3. The bars

Delete them, and delete `MetricRow` with them (which also removes the 8-frame/35ms
tween interval per row - audit problem 5 - in one move).

Why deletion beats fixing: the honest fix is share-of-total normalisation
(`subagent ███████████▏ 15/16`, `skill ▏ 1/16`), and I checked what that buys in the
capture: the events pane already lists every tool call individually, and "which tool got
called most" has never answered a live-session question. A bar that is honest but
useless is still useless. With ≤3 tool types in both fixtures the whole panel is
reproducible as one line.

Replacement, one glanceable line pinned at the bottom of the rail (glyphs and colors
from `glyphForTool`/`colorForTool`, sorted by count):

```
★15 ✦1                    16⚒
```

and at 40 inner with a real mixed session:

```
⚙34 ▤21 ✎12 ★4 ✦2         73⚒
```

AGENT TYPES panel dies with it: type is already on every row (§2), and the count split
is derivable at a glance from row colors.

If anyone insists on keeping a chart, the only honest form at this width is share-of-total
with the raw fraction printed (`██▏······ 4/16`) - never max-of-series.

## 4. Adaptive width

Replace both percentage rules (`App.tsx:264-270`) with character-clamped widths for the
rail. Percentages are why the rail is simultaneously too small to show a description at
100 cols and 44 cols of mostly dead space at 160.

Breakpoints (total terminal cols):

- **≥ 140**: rail fixed 44 cols (40 inner) - the wide mockups. CONTEXT absorbs the slack.
- **110-139**: rail fixed 30 cols (26 inner) - the narrow mockups. At the captured 120x40
  this turns `Ove...sk 157y` into `Overflow task 15   2m`.
- **90-109**: rail not resident. Header keeps `● 15 ◆ 0 ✕ 0`. Moving into the rail pane
  (`l`) slides a 30-col rail in as an overlay on top of CONTEXT; `h`/ESC dismisses it.
  Justification: the 100x40 capture shows the resident rail literally cannot render a
  description at this width, so residency buys nothing.
- **< 90 (incl. 80)**: same as 90-109 - overlay only. The 80x40 capture is the proof:
  resident rail = 17 useless inner cols, CONTEXT crushed to ~25 cols wrapping its own
  placeholder text. At 80 cols the reader must get every column the events pane doesn't take.

Independent of width: **0 subagents → rail width 0** at every breakpoint (not rendered at
all, CONTEXT takes the remainder ~68%). The audit's "one event, no subagents pays 28%"
case goes to zero cost. When the first `agent_started` for a non-root agent arrives the
rail animates in at its breakpoint width.

Focus behavior: when the rail pane is focused/selected it may grow one step
(30 → 44 if total ≥ 124) so the expanded row gets the wide layout while you drive it,
returning on blur. This is optional polish, not required for the density win.

## Summary of deletions

- STATUS panel → header right column
- ACT sparkline → gone
- SKILLS tab → `^K` command
- META tab, AGENT TYPES, TOOL CALLS, `Bar`, `MetricRow` (and its tween timers) → one
  tool-tally line
- rail tabs entirely → rail = SUBAGENTS list + tally line
- percentage widths → char-clamped with 140/110/90 breakpoints, overlay below 110,
  zero-width when empty

Keep `bun run test:tui` green: the terminal-control specs assert on rail text
(`test/TuiTerminalControl.vi.test.ts` uses the overflow fixture), so every string above
that replaces an asserted string needs the spec updated in the same change.
