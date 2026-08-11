/** @jsxImportSource @opentui/solid */
import { TextAttributes } from '@opentui/core'
import { createMemo, on, Show } from 'solid-js'

import { agentTypeAccent } from './AccentPalette'
import { clampCell, renderRow } from './RowLayout'
import { activityFromScan, expandedRowHeight, subagentScan, type SubagentScan } from './SubagentActivity'
import { collapsedRowCells, expandedStatsLine, IDLE_ALERT_MS } from './SubagentRowText'
import type { SubagentStatus, SubagentView } from './Subagents'
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

/** What a collapsed row projects from: nothing, because it renders none of it. */
const emptyScan: SubagentScan = { newestTs: null, runningTool: null, lastOutput: null, outcomeText: null }

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
	/**
	 * The log scan runs only when this agent's entry count moves, and only while
	 * the row is expanded. A collapsed row shows nothing that a scan produces, and
	 * the clock ticking must not drag every agent's whole log through a rescan.
	 */
	const scan = createMemo(
		on(
			() => (props.selected ? props.agent.entries.length : -1),
			() => (props.selected ? subagentScan(props.agent) : emptyScan),
		),
	)
	const activity = createMemo(() => activityFromScan(props.agent, scan(), props.now))
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
			// The height is reserved from the same projection that decides which
			// detail lines exist, so the row cannot render more lines than the list
			// budgeted for it and scroll anchoring stays honest as an agent's status
			// changes underneath the cursor.
			height={props.selected ? expandedRowHeight(activity()) : 1}
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
