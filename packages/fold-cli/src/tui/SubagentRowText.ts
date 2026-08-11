import type { RowCell } from './RowLayout'
import { renderRow } from './RowLayout'
import type { SubagentActivity } from './SubagentActivity'
import { relativeSubagentTime, type SubagentStatus, type SubagentView } from './Subagents'

/**
 * The text of a subagent row, apart from the component that draws it.
 *
 * These are the parts worth pinning with tests: which glyph a status gets, what
 * survives at a narrow width, whether a working agent is called idle. They live
 * outside the `.tsx` because the JSX file can only be transformed inside the
 * OpenTUI harness, which would leave the row's exact text asserted only through
 * captured frames.
 */

/**
 * Status is a glyph, not a word.
 *
 * `RUNNING` next to a spinner spends twelve columns restating the spinner, and
 * those were the twelve columns that pushed the description off the row.
 */
export const statusGlyph = (status: SubagentStatus): string => {
	switch (status) {
		case 'running':
			return '◐'
		case 'done':
			return '◆'
		case 'error':
			return '✕'
		case 'interrupted':
			return '⊘'
		case 'stopped':
			return '■'
	}
}

/** A compact duration for the row's tail: `4m`, `2h`, `now`. */
export const shortDuration = (ms: number): string => {
	const seconds = Math.floor(ms / 1_000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h`
	return `${Math.floor(hours / 24)}d`
}

/**
 * An agent that has been silent this long, with no tool out running to explain
 * it, is worth a second look.
 *
 * The threshold is deliberately generous: a model can take a while to produce
 * its next turn, and crying wolf at thirty seconds would train the reader to
 * ignore the colour.
 */
export const IDLE_ALERT_MS = 90_000

export const typeAbbreviation = (type: string): string => {
	const words = type.split(/[^a-z0-9]+/i).filter((word) => word.length > 0)
	if (words.length === 0) return type.slice(0, 4)
	if (words.length === 1) return (words[0] ?? '').slice(0, 4)
	return words
		.map((word) => word[0] ?? '')
		.join('')
		.slice(0, 4)
}

/** The collapsed line, as cells so the decoration yields before the description. */
export const collapsedRowCells = (agent: SubagentView, now: number): ReadonlyArray<RowCell> => [
	{ text: statusGlyph(agent.status), weight: 'required' },
	{ text: agent.description, weight: 'subject', minWidth: 6 },
	{ text: typeAbbreviation(agent.type), weight: 'optional', priority: 0 },
	{ text: relativeSubagentTime(agent.calledAt, now), weight: 'optional', priority: 1 },
]

/**
 * The line under an expanded row: how much work it has done, and either how long
 * its tool has been running or how long it has been quiet.
 *
 * A running tool is reported as its own elapsed time rather than as idleness,
 * because a subagent emits nothing at all while a tool is out, and calling that
 * idle would flag every slow-but-healthy agent.
 */
export const expandedStatsLine = (activity: SubagentActivity, type: string, width: number): string => {
	const timing =
		activity.runningToolMs !== null
			? `running ${shortDuration(activity.runningToolMs)}`
			: activity.idleMs !== null && activity.status === 'running'
				? `idle ${shortDuration(activity.idleMs)}`
				: shortDuration(activity.ageMs)
	return renderRow(
		[
			{ text: typeAbbreviation(type), weight: 'optional', priority: 0 },
			{ text: `${activity.turns}t`, weight: 'optional', priority: 2 },
			{ text: `${activity.tools}⚒`, weight: 'optional', priority: 3 },
			{ text: timing, weight: 'subject', minWidth: 3 },
		],
		width,
	)
}
