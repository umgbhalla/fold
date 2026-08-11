/**
 * How the three panes divide the terminal.
 *
 * The widths used to be percentages, which is why the rail was simultaneously
 * too narrow to render a subagent's description at 100 columns and 44 columns of
 * mostly blank panel at 160. A rail needs a roughly constant number of columns
 * to say what it has to say, so it gets character widths and the reader absorbs
 * whatever is left.
 */

/** Total columns a pane occupies, including its one-column borders. */
export type PaneWidths = {
	readonly events: number
	readonly context: number
	/** Zero when the rail is not resident. */
	readonly rail: number
}

/** Inner columns available to rail content, once its borders are removed. */
export const railInnerWidth = (railWidth: number): number => Math.max(0, railWidth - 2)

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

/**
 * The rail's resident width for a terminal of `totalWidth` columns.
 *
 * Zero has two causes and they mean the same thing to the layout: there are no
 * subagents to list, or the terminal is too narrow for the rail to earn its
 * columns. At 100 columns a resident rail rendered every agent as a blank
 * description, so residency there was costing a quarter of the screen to show
 * nothing; below the threshold the rail becomes something you open, not
 * something you keep.
 */
export const railWidthFor = (totalWidth: number, agentCount: number): number => {
	if (agentCount === 0) return 0
	if (totalWidth < 110) return 0
	if (totalWidth < 140) return 30
	return 44
}

/**
 * Divide the terminal between the panes.
 *
 * The index is sized from the terminal rather than from what the rail left over,
 * so the rail appearing or collapsing moves columns between the rail and the
 * reader and leaves the index where it was. An index that resized every time a
 * subagent finished would make the whole layout twitch during a live session.
 *
 * It is also capped: it lists sequence numbers and short summaries, and past
 * roughly fifty columns the extra space stops buying legibility.
 */
export const paneWidths = (totalWidth: number, agentCount: number): PaneWidths => {
	const rail = railWidthFor(totalWidth, agentCount)
	const events = clamp(Math.floor(totalWidth * 0.28), 24, 52)
	return { events, context: Math.max(0, totalWidth - rail - events), rail }
}
