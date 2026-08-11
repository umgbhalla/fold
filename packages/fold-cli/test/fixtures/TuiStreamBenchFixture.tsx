/** @jsxImportSource @opentui/solid */
import { AgentId, MessageId, ToolCallId, type LogEntry } from '@humanlayer/fold-core'
import { createCliRenderer } from '@opentui/core'
import { render } from '@opentui/solid'
import { createComputed, createSignal } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

import { TuiApp } from '../../src/tui/App'
import { makeSessionStateFromEntries, reduceSessionEvents } from '../../src/tui/SessionState'

/**
 * A streaming session with no network in it.
 *
 * The live A/B against a real model was inconclusive: run-to-run variance in
 * generation speed (1.7 s of CPU across repeats) was larger than the difference
 * between the two builds. This drives the same code deterministically instead.
 *
 * Four earlier versions of this file measured nothing, each silently:
 *   - sleeping between tokens put idle time in the sample, and both builds
 *     scored an identical 1746 ms;
 *   - yielding with `setImmediate` never let the renderer paint, so 300 tokens
 *     "took" 22 ms;
 *   - `targetFps: 30` meant every configuration reported exactly 20.4 ms per
 *     frame, which was the frame cap rather than the work;
 *   - feeding tokens as `assistant-message` log entries hit the reducer's
 *     duplicate-seq guard, so every token after the first was dropped.
 * Tokens now arrive as `text-delta` events on the renderer's own frame
 * callback, which is what the live session does. Measured across that fix,
 * `apply` went from 22 ms to 192 ms: the earlier numbers were not the render
 * path at all.
 *
 * ```sh
 * FOLD_BENCH_ROWS=200 FOLD_BENCH_TOKENS=400 bun test/fixtures/TuiStreamBenchFixture.tsx
 * ```
 */
/**
 * The fixture owns the terminal, so a thrown error is painted over and lost.
 * Every failure while building this bench surfaced as a silent hang until the
 * stack was written somewhere the harness could read it.
 */
const reportFatal = (error: unknown): void => {
	const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
	void Bun.write(process.env.FOLD_BENCH_ERROR ?? '/tmp/fold-bench-error.txt', detail)
	process.exit(1)
}
process.on('uncaughtException', reportFatal)
process.on('unhandledRejection', reportFatal)

const rootAgentId = AgentId.make('agent_bench00000000000000000')
const rowCount = Number(process.env.FOLD_BENCH_ROWS ?? '200')
const tokenCount = Number(process.env.FOLD_BENCH_TOKENS ?? '400')

const pad = (value: number, prefix: string): string => `${prefix}_${String(value).padStart(24, '0')}`

/** A settled transcript of `rowCount` exchanges, so the row list is realistic. */
const durableEntries: ReadonlyArray<LogEntry> = Array.from({ length: rowCount }, (_, index) => ({
	_tag: 'assistant-message' as const,
	seq: index,
	ts: index,
	agentId: rootAgentId,
	parentAgentId: null,
	toolCallId: null,
	messageId: MessageId.make(pad(index, 'msg')),
	message: {
		role: 'assistant' as const,
		content: [
			{ type: 'text' as const, text: `Settled line ${index} of the transcript, long enough to wrap once.` },
		],
	},
	finish: null,
}))

/**
 * A fleet of subagents, each with its own traffic.
 *
 * Without these the bench measured nothing: `subagentViews` is the projection
 * that was quadratic in (entries x agents), and a transcript of plain root
 * messages never calls into it, so both builds scored an identical 20.4 ms per
 * frame. A real session that feels choppy has subagents in it.
 */
const agentCount = Number(process.env.FOLD_BENCH_AGENTS ?? '12')
const perAgent = Number(process.env.FOLD_BENCH_PER_AGENT ?? '30')
const subagentEntries: ReadonlyArray<LogEntry> = Array.from({ length: agentCount }, (_, agentIndex) => {
	const agentId = AgentId.make(pad(agentIndex, 'agent').slice(0, 30))
	const base = rowCount + agentIndex * (perAgent + 1)
	const started: LogEntry = {
		_tag: 'agent_started',
		seq: base,
		ts: base,
		agentId,
		parentAgentId: rootAgentId,
		toolCallId: ToolCallId.make(pad(agentIndex, 'tool_call')),
		agentType: 'researcher',
		mode: 'fresh',
		model: {
			providerId: 'anthropic',
			providerKind: 'anthropic',
			modelId: 'bench-model',
			role: null,
			requestedReasoningLevel: 'off',
			thinking: { _tag: 'disabled' },
		},
		tools: [],
		skill: null,
		fork: null,
	}
	const traffic: ReadonlyArray<LogEntry> = Array.from({ length: perAgent }, (_, index) => ({
		_tag: 'assistant-message' as const,
		seq: base + index + 1,
		ts: base + index + 1,
		agentId,
		parentAgentId: rootAgentId,
		toolCallId: null,
		messageId: MessageId.make(pad(base + index + 1, 'msg')),
		message: { role: 'assistant' as const, content: [{ type: 'text' as const, text: `agent line ${index}` }] },
		finish: null,
	}))
	return [started, ...traffic]
}).flat()

// Does the app's own module graph get reactive Solid, or the inert server
// build? Everything measured here is meaningless if it is the latter.
{
	const [probe, setProbe] = createSignal(0)
	let runs = 0
	createComputed(() => {
		runs += 1
		void probe()
	})
	setProbe(1)
	await Bun.write('/tmp/fold-solid-build.txt', `computedRuns=${runs} (2 = reactive, 1 = inert server build)\n`)
}

const renderer = await createCliRenderer({
	// Match the app (Shell.tsx), or the bench measures the frame cap, not the work:
	// at 30 fps every configuration scored exactly 20.4 ms per frame.
	targetFps: 60,
	exitOnCtrlC: false,
	consoleMode: 'disabled',
	useKittyKeyboard: {},
})

const [state, setState] = createStore(makeSessionStateFromEntries([...durableEntries, ...subagentEntries], rootAgentId))

await render(
	() => (
		<TuiApp
			state={() => state}
			cwd="/workspace/fold"
			sessionId="sess_bench0000000000000000000"
			mode="default"
			profile="default"
			notice={() => null}
			targetNotice={() => null}
			onSubmit={() => {}}
			onCompact={() => {}}
			onInterrupt={() => {}}
		/>
	),
	renderer,
)

// Let the first paint settle before timing anything.
await new Promise((resolve) => setTimeout(resolve, 1500))

/**
 * Drive one token per painted frame and count the frames.
 *
 * Choppiness is the frame loop missing its deadline, so the measurement has to
 * be per frame. Two earlier shapes measured nothing: sleeping between tokens
 * put idle time in the sample and both builds scored 1746 ms, and yielding with
 * `setImmediate` never let the renderer paint at all, so 300 tokens "took"
 * 22 ms. A frame callback is the renderer's own clock.
 */
let painted = 0
let applyTotal = 0
const cpuBefore = process.cpuUsage()
const started = performance.now()
const frameTimes: Array<number> = []
let lastFrameAt = started

await new Promise<void>((resolve) => {
	const onFrame = async (): Promise<void> => {
		if (painted >= tokenCount) {
			renderer.removeFrameCallback(onFrame)
			resolve()
			return
		}
		painted += 1
		const applyStart = performance.now()
		setState(
			reconcile(
				reduceSessionEvents(
					state,
					[
						{
							kind: 'delta',
							agentId: rootAgentId,
							parentAgentId: null,
							toolCallId: null,
							part: { type: 'text-delta', id: 'stream', delta: 'token ' },
						},
					],
					rootAgentId,
				),
			),
		)
		applyTotal += performance.now() - applyStart
		// Per-frame wall time, so a cost that grows with the streamed text shows up
		// as a rising curve rather than an average that hides it.
		const now = performance.now()
		frameTimes.push(now - lastFrameAt)
		lastFrameAt = now
		renderer.requestRender()
	}
	renderer.setFrameCallback(onFrame)
	renderer.requestRender()
})

const wall = performance.now() - started
const cpu = process.cpuUsage(cpuBefore)

// Proof the rail and transcript were actually on screen: a bench that silently
// rendered an empty pane would report a flat 20.4 ms whatever it was given,
// which is exactly what several earlier versions of this file did.
// Hold the final frame so the harness can read the screen and confirm the rail
// and transcript were really on it.
await new Promise((resolve) => setTimeout(resolve, Number(process.env.FOLD_BENCH_HOLD_MS ?? '0')))

renderer.destroy()
// The fixture owns the terminal, so the result goes to a file rather than a
// stream the renderer has taken over.
await Bun.write(
	process.env.FOLD_BENCH_OUT ?? '/tmp/fold-bench.txt',
	`rows=${rowCount} agents=${agentCount} entries=${state.allEntries.length} frames=${painted} apply=${applyTotal.toFixed(0)}ms wall=${wall.toFixed(0)}ms streamCpu=${((cpu.user + cpu.system) / 1000).toFixed(0)}ms fps=${(painted / (wall / 1000)).toFixed(1)} firstQuarter=${(frameTimes.slice(0, Math.floor(frameTimes.length / 4)).reduce((a, b) => a + b, 0) / Math.floor(frameTimes.length / 4)).toFixed(1)}ms lastQuarter=${(frameTimes.slice(-Math.floor(frameTimes.length / 4)).reduce((a, b) => a + b, 0) / Math.floor(frameTimes.length / 4)).toFixed(1)}ms\n`,
)
process.exit(0)
