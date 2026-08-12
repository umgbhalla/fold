# Design notes: what to build next

Four agents read the reference codebases and attacked the current design.
This is what came back, what survived checking, and what was done about it.

## Already done, because the criticism was right

A hostile review of the pane-collapse work found three defects. All three
reproduced, all three are fixed (`1adad39`).

- **Rail sections reordered by recency.** Position is the only identity a
  sidebar has in a terminal: one font, one size, so "CHANGES is third" is the
  whole mental model, and it expired every time you opened something else.
  Order is now fixed; recency still decides how much of each name is spelled
  out, which is the part that actually buys space.
- **Empty sections vanished.** Editing a file made CHANGES appear and pushed
  everything below it down a slot; committing pushed them back. Same
  instability, triggered by events the user did not initiate. Empty sections
  are now listed and dimmed.
- **`z`'s `far` policy was unpredictable.** Keyed on adjacency, it gave the
  focused pane 139 columns from either end and 114 from the middle, so the same
  keystroke did visibly different things depending on where you stood. It now
  keys on the reader, which is the only pairing worth having.

Also added: the spine shows the `z` that expands it. A collapsed pane whose
only affordance is a border tells the user nothing, and the person most likely
to meet one is on a narrow terminal and has never pressed `z`.

## The measurement that matters most

OpenTUI does not virtualize. There is no windowing, culling, or viewport
check anywhere in `@opentui/core`: a scrollbox lays out every child every
frame whether or not it is on screen. Measured on our own bench, streaming
into a transcript of:

```
  100 rows   apply  63 ms   cpu  876 ms   48.4 fps
  400 rows   apply 158 ms   cpu 1155 ms   47.4 fps
 1200 rows   apply 510 ms   cpu 1965 ms   44.8 fps
```

Eight times the work for twelve times the rows, while roughly forty rows are
visible at any moment. Every other perf idea below is noise next to this one.
The opencode miner independently confirmed they have not solved it either, so
there is nothing to copy: it has to be built.

**Windowing the transcript is the single highest-value change available.**

## Worth building, in order

1. **Transcript windowing** (above). Render the visible slice plus a margin,
   pad with a spacer of the right height so the scrollbar still behaves.
   The row heights are already computed for layout, so the slice is derivable.

2. **Prompt stash** (opencode `prompt/stash.tsx`, 89 lines). Park a
   half-written prompt and come back to it. Cheap, and it prevents real data
   loss: today an interruption costs the draft.

3. **Blur-aware notifications** (opencode `attention.ts`, 260 lines;
   `notifications.ts:11-17`). OS notification only when the terminal is _not_
   focused, per-event sounds, and subagent completions deliberately never
   raise an OS notification because they are not user-blocking. For an agent
   that runs long tools, this is the difference between watching and working.

4. **Retry countdown** (pi `status-indicator.ts:39-60`, `countdown-timer.ts`).
   "Retrying (2/5) in 8s, ctrl+c to cancel" instead of a stalled spinner.
   Small, and it turns the worst moment in the UI into an explained one.

5. **Live subagent observation** (prime-agent `core/agent-observe.ts`).
   `isStreaming`, `isCompacting`, `queuedCount`, `latestMessage` for another
   running agent. This is the substrate the SUBAGENTS rail wants: today it
   reports status, not what the agent is doing right now.

6. **Session timeline and fork** (opencode `dialog-timeline.tsx`,
   `dialog-fork-from-timeline.tsx`). Jump to any earlier user message, or
   branch a new session from it with the original prompt restored. The
   deepest gap of the four codebases: fold has no rewind of any kind.
   pi's `session/session.ts` is the reference for the durable side of it.

7. **Permission diff preview** (opencode `permission.tsx:22-88`). Render the
   actual diff inside the approval prompt, split or unified by terminal
   width, rather than approving a description of a change.

## MCP: what it would actually cost

fold has no MCP anywhere. Neither does opencode's TUI, and prime-agent's is
not the shortcut it first appears: its TS side is only a catalog
(`packages/ai/src/mcp/catalog.ts`, 53 lines), an OAuth provider factory
(`oauth.ts`, 380 lines, PKCE, tokens keyed `mcp:<server>`), and an idempotent
manager (`mcp-manager.ts`, 205 lines). The protocol itself runs Python-side
in their kernel, which fold does not have.

So porting MCP means writing the client, not copying one: streamable-HTTP and
SSE transport, JSON-RPC framing, tool discovery and schema translation into
fold's tool contract. Their catalog-plus-OAuth-factory shape is worth
following. Their transport is not available to us.

Estimate: HTTP-only MCP with OAuth is a real 500-600 lines and a new
dependency decision. stdio servers add process lifecycle on top.

## Deliberately not doing

- **which-key overlay** (opencode `which-key.tsx`, 600+ lines). A whole
  interaction paradigm for discovering keybindings. The cheap 5% of it, "press
  `?` for what is reachable from here", is worth having; the rest is not.
- **Recency-ranked file autocomplete** (opencode `frecency.tsx`,
  `frequency / (1 + daysSinceOpen)`). Good idea, but fold's composer does not
  have file autocomplete to rank yet.
- **Daemon and detachable sessions** (prime-agent `daemon-mode.ts`, ~2500
  lines). "Close the terminal, agent keeps running" is a genuinely different
  product shape, with a wire protocol and version negotiation behind it. Worth
  wanting; not worth starting on the side of a layout change.
