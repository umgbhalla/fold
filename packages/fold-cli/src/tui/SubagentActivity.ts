import type { AgentFinishedLogEntry, LogEntry } from '@humanlayer/fold-core'

import type { SubagentStatus, SubagentView } from './Subagents'

/**
 * What a subagent is doing right now, for the rail's expanded row.
 *
 * The collapsed rail answers "which agents exist"; this answers the question
 * that actually costs time in a live session, "is this one working or stuck",
 * and it answers it without leaving the rail. Every field is derived from the
 * agent's own `entries`, so nothing new has to be threaded through the log.
 */
export type SubagentActivity = {
	readonly status: SubagentStatus
	readonly turns: number
	readonly tools: number
	/** Milliseconds since dispatch. */
	readonly ageMs: number
	/**
	 * Milliseconds of silence that are not explained by a tool still running.
	 *
	 * Null while a tool is in flight. A subagent produces no log entries for the
	 * whole duration of a `bash` call, so a plain "time since the newest entry"
	 * counts a healthy three-minute test run as three minutes of silence and
	 * would flag every slow-but-fine agent as stuck. Silence only means something
	 * once nothing is out running.
	 */
	readonly idleMs: number | null
	/** The tool call still in flight, if the newest tool call has no result yet. */
	readonly runningTool: { readonly name: string; readonly summary: string } | null
	/** How long the in-flight tool has been running, if there is one. */
	readonly runningToolMs: number | null
	/** The newest tool result or assistant line, already flattened to one line. */
	readonly lastOutput: string | null
	/** For a finished agent, its result text; for a failed one, its reason. */
	readonly outcomeText: string | null
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const field = (value: unknown, name: string): unknown =>
	typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined

/** Collapse to a single line: a rail row cannot render a newline. */
const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim()

/**
 * The most identifying part of a tool call.
 *
 * A bash call is its command, a file call is its path, a subagent call is its
 * description. Falling back to the whole JSON blob is deliberate: an unknown
 * tool showing `{"pattern":"foo"}` still says more than a bare tool name.
 */
export const toolCallSummaryLine = (params: unknown): string => {
	const command = text(field(params, 'command'))
	if (command !== undefined) return oneLine(command)
	const path = text(field(params, 'path'))
	if (path !== undefined) return oneLine(path)
	const description = text(field(params, 'description'))
	if (description !== undefined) return oneLine(description)
	const prompt = text(field(params, 'prompt'))
	if (prompt !== undefined) return oneLine(prompt)
	if (params === undefined || params === null) return ''
	return oneLine(JSON.stringify(params) ?? '')
}

const resultPartText = (part: unknown): string | null => {
	const result = field(part, 'result')
	if (typeof result === 'string') return result
	const output = text(field(result, 'output'))
	if (output !== undefined) return output
	const message = text(field(result, 'message'))
	if (message !== undefined) return message
	const content = field(result, 'content')
	if (typeof content === 'string') return content
	if (Array.isArray(content)) {
		const first = content.find((item) => text(field(item, 'text')) !== undefined)
		const value = text(field(first, 'text'))
		if (value !== undefined) return value
	}
	return result === undefined ? null : (JSON.stringify(result) ?? null)
}

type ToolCall = { readonly id: string; readonly name: string; readonly summary: string }

const toolCallsOf = (entry: LogEntry): ReadonlyArray<ToolCall> => {
	if (entry._tag !== 'assistant-message' || typeof entry.message.content === 'string') return []
	return entry.message.content.flatMap((part) =>
		part.type === 'tool-call'
			? [{ id: String(part.id), name: part.name, summary: toolCallSummaryLine(part.params) }]
			: [],
	)
}

const resolvedToolCallIds = (entries: ReadonlyArray<LogEntry>): ReadonlySet<string> => {
	const resolved = new Set<string>()
	for (const entry of entries) {
		if (entry._tag !== 'tool-result' || typeof entry.message.content === 'string') continue
		for (const part of entry.message.content) {
			if (part.type === 'tool-result') resolved.add(String(part.id))
		}
	}
	return resolved
}

const lastAssistantText = (entries: ReadonlyArray<LogEntry>): string | null => {
	for (const entry of entries.toReversed()) {
		if (entry._tag !== 'assistant-message') continue
		if (typeof entry.message.content === 'string') {
			const value = oneLine(entry.message.content)
			if (value.length > 0) return value
			continue
		}
		for (const part of entry.message.content.toReversed()) {
			if (part.type !== 'text') continue
			const value = oneLine(part.text)
			if (value.length > 0) return value
		}
	}
	return null
}

const lastToolOutput = (entries: ReadonlyArray<LogEntry>): string | null => {
	for (const entry of entries.toReversed()) {
		if (entry._tag !== 'tool-result' || typeof entry.message.content === 'string') continue
		for (const part of entry.message.content.toReversed()) {
			if (part.type !== 'tool-result') continue
			const value = resultPartText(part)
			if (value === null) continue
			const line = oneLine(value)
			if (line.length > 0) return line
		}
	}
	return null
}

/**
 * The newest tool call that never got a result, and when it was dispatched.
 *
 * Pairing by id rather than taking the newest call is what makes this useful:
 * an agent that has called `bash` ten times and had all ten return is not
 * running `bash`, and showing its last command as if it were live is worse than
 * showing nothing.
 */
const runningToolOf = (
	entries: ReadonlyArray<LogEntry>,
): { readonly name: string; readonly summary: string; readonly since: number } | null => {
	const resolved = resolvedToolCallIds(entries)
	for (const entry of entries.toReversed()) {
		for (const call of toolCallsOf(entry).toReversed()) {
			if (!resolved.has(call.id)) return { name: call.name, summary: call.summary, since: entry.ts }
		}
	}
	return null
}

const finishOf = (entries: ReadonlyArray<LogEntry>): AgentFinishedLogEntry | undefined =>
	entries.filter((entry): entry is AgentFinishedLogEntry => entry._tag === 'agent-finished').at(-1)

/**
 * The part of an agent's activity that only its log can change.
 *
 * Split out from the clock-dependent part because scanning an agent's entries
 * is the expensive half and the clock ticks far more often than the log grows:
 * folding both into one memo made every agent rescan its whole log on each tick,
 * which is quadratic in a session with a large fleet.
 */
export type SubagentScan = {
	readonly newestTs: number | null
	readonly runningTool: { readonly name: string; readonly summary: string; readonly since: number } | null
	readonly lastOutput: string | null
	readonly outcomeText: string | null
}

/** Scan one agent's log. Recompute only when its entries change. */
export const subagentScan = (agent: SubagentView): SubagentScan => {
	const finish = finishOf(agent.entries)
	return {
		newestTs: agent.entries.at(-1)?.ts ?? null,
		runningTool: agent.status === 'running' ? runningToolOf(agent.entries) : null,
		lastOutput: lastToolOutput(agent.entries) ?? lastAssistantText(agent.entries),
		outcomeText:
			finish === undefined
				? null
				: finish.outcome === 'completed'
					? (finish.resultText === null ? null : oneLine(finish.resultText)) || null
					: (finish.reason ?? finish.resultText) === null
						? null
						: oneLine(finish.reason ?? finish.resultText ?? '') || null,
	}
}

/**
 * Combine a scan with the current time.
 *
 * Cheap enough to run on every clock tick: it does arithmetic, not scanning.
 */
export const activityFromScan = (agent: SubagentView, scan: SubagentScan, now: number): SubagentActivity => ({
	status: agent.status,
	turns: agent.turns,
	tools: agent.tools,
	ageMs: Math.max(0, now - agent.calledAt),
	// Silence during a tool call is the tool working, not the agent stalling, so
	// it is not reported as idle at all.
	idleMs: scan.runningTool !== null || scan.newestTs === null ? null : Math.max(0, now - scan.newestTs),
	runningTool: scan.runningTool === null ? null : { name: scan.runningTool.name, summary: scan.runningTool.summary },
	runningToolMs: scan.runningTool === null ? null : Math.max(0, now - scan.runningTool.since),
	lastOutput: scan.lastOutput,
	outcomeText: scan.outcomeText,
})

/**
 * Project one subagent's log into the fields the expanded rail row renders.
 *
 * `now` is a parameter so the caller's clock signal drives re-rendering and so
 * this stays a pure function under test.
 */
export const subagentActivity = (agent: SubagentView, now: number): SubagentActivity =>
	activityFromScan(agent, subagentScan(agent), now)

/**
 * How many lines the expanded row occupies for a given activity.
 *
 * The rail reserves this before rendering so the list's scroll height is known
 * without measuring text, and so a row cannot silently grow past its budget.
 */
export const expandedRowHeight = (activity: SubagentActivity): number => {
	const detail = [activity.runningTool === null ? null : 'tool', activity.outcomeText ?? activity.lastOutput].filter(
		(value) => value !== null,
	)
	return 2 + detail.length
}
