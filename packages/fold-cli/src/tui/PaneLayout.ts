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

/**
 * How much of the terminal the focused pane may take from its neighbours.
 *
 * A pane you are working in is worth more columns than one you are glancing at,
 * but only up to a point: shove too hard and the panes you are not in stop
 * being readable, which defeats having them on screen at all. A fifth is enough
 * to feel the pane come forward and still leave its neighbours legible.
 */
const FOCUS_SHARE = 0.2

/**
 * The pane the user is working in, if any, so it can claim extra columns.
 *
 * Named for the layout slot rather than for the navigation pane, because the
 * rail's slot is `rail` while navigation calls it `subagents`; callers convert
 * once at the boundary instead of every consumer guessing.
 */
export type FocusedPane = keyof PaneWidths | null

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
 *
 * The focused pane then grows by taking a share of each other pane, which is
 * what makes moving between panes feel like moving rather than like relabelling
 * a border. Every pane keeps a floor so the ones you are not in stay readable,
 * and a pane that is not on screen (a collapsed rail) neither gives nor takes.
 */
export const paneWidths = (totalWidth: number, agentCount: number, focused: FocusedPane = null): PaneWidths => {
	const rail = railWidthFor(totalWidth, agentCount)
	const events = clamp(Math.floor(totalWidth * 0.28), 24, 52)
	const base: PaneWidths = { events, context: Math.max(0, totalWidth - rail - events), rail }
	if (focused === null || base[focused] === 0) return base

	// Each unfocused pane lends a share of itself, never going under its floor,
	// and the focused pane takes exactly what was lent so the row still sums to
	// the terminal width.
	const floors: Record<keyof PaneWidths, number> = { events: 20, context: 24, rail: 24 }
	const lenders = (['events', 'context', 'rail'] as const).filter((pane) => pane !== focused && base[pane] > 0)
	let taken = 0
	const widths = { ...base }
	for (const pane of lenders) {
		const lent = Math.max(0, Math.min(Math.floor(base[pane] * FOCUS_SHARE), base[pane] - floors[pane]))
		widths[pane] = base[pane] - lent
		taken += lent
	}
	widths[focused] = base[focused] + taken
	return widths
}
