/** @jsxImportSource @opentui/solid */
import { TextAttributes } from '@opentui/core'
import { createMemo, Show } from 'solid-js'

import { agentTypeAccent } from './AccentPalette'
import { clampCell, renderRow, type RowCell } from './RowLayout'
import { subagentActivity, type SubagentActivity } from './SubagentActivity'
import { relativeSubagentTime, type SubagentStatus, type SubagentView } from './Subagents'
import { theme } from './ThemeState'

/**
 * One subagent in the rail: a single line normally, expanded in place when
 * selected.
 *
 * The old row was always two lines and said the same thing whether or not you
 * had selected it, so fifteen agents cost thirty rows to convey fifteen
 * statuses. Here the unselected rows cost one line each and the selected one
 * spends its extra lines on what you selected it to find out: what it is
 * running, how long it has been silent, and how it ended.
 */

/**
 * Status is a glyph, not a word.
 *
 * `RUNNING` next to a spinner spends twelve columns restating the spinner, and
 * those were the twelve columns that pushed the description off the row.
 */
const statusGlyph = (status: SubagentStatus): string => {
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

const statusColor = (status: SubagentStatus): string => {
	switch (status) {
		case 'running':
			return theme.color.coreBright
		case 'done':
			return theme.color.grid
		case 'error':
			return theme.color.alert
		case 'interrupted':
			return theme.color.inject
		case 'stopped':
			return theme.color.textDim
	}
}

/** A compact duration for the row's tail: `4m`, `2h`, `now`. */
const shortDuration = (ms: number): string => {
	const seconds = Math.floor(ms / 1_000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h`
	return `${Math.floor(hours / 24)}d`
}

/**
 * An agent that has not produced an entry for this long is worth a second look.
 *
 * The threshold is deliberately generous: a compile or a test run routinely goes
 * a minute without emitting anything, and crying wolf at thirty seconds would
 * train the reader to ignore the colour.
 */
const IDLE_ALERT_MS = 90_000

const typeAbbreviation = (type: string): string => {
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
 * The line under an expanded row: how much work it has done and how long it has
 * been quiet.
 */
export const expandedStatsLine = (activity: SubagentActivity, type: string, width: number): string =>
	renderRow(
		[
			{ text: typeAbbreviation(type), weight: 'optional', priority: 0 },
			{ text: `${activity.turns}t`, weight: 'optional', priority: 2 },
			{ text: `${activity.tools}⚒`, weight: 'optional', priority: 3 },
			{
				text:
					activity.status === 'running'
						? activity.idleMs === null
							? shortDuration(activity.ageMs)
							: `idle ${shortDuration(activity.idleMs)}`
						: shortDuration(activity.ageMs),
				weight: 'subject',
				minWidth: 3,
			},
		],
		width,
	)

const SubagentDetailLine = (props: {
	readonly glyph: string
	readonly text: string
	readonly color: string
	readonly width: number
}) => (
	<box height={1} flexShrink={0} flexDirection="row" paddingLeft={2}>
		<text fg={props.color} wrapMode="none">
			{`${props.glyph} ${clampCell(props.text, Math.max(0, props.width - 4))}`}
		</text>
	</box>
)

export const SubagentRow = (props: {
	readonly agent: SubagentView
	readonly selected: boolean
	readonly now: number
	/** Inner width of the rail, in columns. */
	readonly width: number
	readonly onSelect: () => void
}) => {
	const activity = createMemo(() => subagentActivity(props.agent, props.now))
	const collapsed = createMemo(() =>
		renderRow(collapsedRowCells(props.agent, props.now), Math.max(0, props.width - 2)),
	)
	const idleAlert = createMemo(() => {
		const idle = activity().idleMs
		return props.agent.status === 'running' && idle !== null && idle >= IDLE_ALERT_MS
	})

	return (
		<box
			id={`subagent:${props.agent.agentId}`}
			flexDirection="column"
			flexShrink={0}
			backgroundColor={props.selected ? theme.color.raised : theme.color.panel}
			onMouseDown={() => props.onSelect()}
		>
			<box height={1} flexDirection="row">
				<text fg={theme.color.coreBright} width={1} wrapMode="none">
					{props.selected ? '▸' : ' '}
				</text>
				<text
					fg={props.selected ? theme.color.text : statusColor(props.agent.status)}
					{...(props.selected ? { attributes: TextAttributes.BOLD } : {})}
					wrapMode="none"
				>
					{collapsed()}
				</text>
			</box>
			<Show when={props.selected}>
				<box height={1} flexShrink={0} flexDirection="row" paddingLeft={2}>
					<text fg={idleAlert() ? theme.color.alert : theme.color.textDim} wrapMode="none">
						{expandedStatsLine(activity(), props.agent.type, Math.max(0, props.width - 2))}
					</text>
				</box>
				<Show when={activity().runningTool}>
					<SubagentDetailLine
						glyph="⚙"
						color={agentTypeAccent(props.agent.type)}
						width={props.width}
						text={`${activity().runningTool?.name ?? ''} ${activity().runningTool?.summary ?? ''}`.trim()}
					/>
				</Show>
				<Show when={activity().outcomeText ?? activity().lastOutput}>
					<SubagentDetailLine
						glyph="└"
						color={activity().status === 'error' ? theme.color.alert : theme.color.textFaint}
						width={props.width}
						text={activity().outcomeText ?? activity().lastOutput ?? ''}
					/>
				</Show>
			</Show>
		</box>
	)
}
