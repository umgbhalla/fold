/** @jsxImportSource @opentui/solid */
import { Index } from 'solid-js'

import { spineLabel } from './PaneStack'
import { theme } from './ThemeState'

/**
 * A collapsed pane: a bordered column of its name, read top to bottom.
 *
 * The badge is what makes a spine worth having over simply hiding the pane. A
 * hidden pane is forgotten; a spine that reads `3` tells you something arrived
 * while you were reading something else, and which key brings it back.
 */
export const PaneSpine = (props: {
	readonly label: string
	readonly height: number
	readonly active: boolean
	readonly badge?: string
	readonly onSelect?: () => void
}) => {
	// Two rows of the column are the box's own border, and the badge takes one
	// more when present.
	const rows = (): number => Math.max(0, props.height - 2 - (props.badge === undefined ? 0 : 1))
	return (
		<box
			width={3}
			flexShrink={0}
			flexDirection="column"
			alignItems="center"
			border
			borderStyle={theme.chrome.panelStyle}
			borderColor={props.active ? theme.color.coreBright : theme.chrome.border}
			backgroundColor={theme.color.panel}
			onMouseDown={() => props.onSelect?.()}
		>
			<Index each={spineLabel(props.label, rows())}>
				{(letter) => (
					<text fg={props.active ? theme.color.coreBright : theme.color.textDim} wrapMode="none">
						{letter()}
					</text>
				)}
			</Index>
			{props.badge === undefined ? null : (
				<>
					<box flexGrow={1} />
					<text fg={theme.color.core} wrapMode="none">
						{props.badge}
					</text>
				</>
			)}
		</box>
	)
}
