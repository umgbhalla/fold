/**
 * Collapsing panes to a spine, so the focused pane can have the screen.
 *
 * The existing layout ({@link paneWidths}) shares columns proportionally and
 * lets the focused pane take a fifth from each neighbour. That keeps every pane
 * legible, which is the right default and the wrong ceiling: three legible
 * panes at 170 columns means the one you are reading gets 94, and at 120 it
 * gets 60. The columns are spent keeping panes readable that you are not
 * reading.
 *
 * A pane you are not in does not need to be legible. It needs to be findable,
 * and to say whether anything happened in it. That is a vertical label and a
 * count, which fit in three columns instead of thirty.
 *
 * ```
 *   spread (today)                    stack, context focused
 *   ┌ EVENTS ─┐┌ CONTEXT ─┐┌ RAIL ┐   ┌┐┌ CONTEXT ───────────────┐┌┐
 *   │ 3 › ... ││ message  ││ ◆ a  │   │E││ message text, wide     ││R│
 *   │ 4 ◇ ... ││ text     ││ ◆ b  │   │V││ enough that diffs and  ││A│
 *   │         ││          ││      │   │E││ code stop wrapping     ││I│
 *   │         ││          ││      │   │N││                        ││L│
 *   │         ││          ││      │   │T││                        ││ │
 *   │         ││          ││      │   │S││                        ││2│
 *   └─────────┘└──────────┘└──────┘   └┘└────────────────────────┘└┘
 * ```
 */

/** How much of itself a pane is currently showing. */
export type PaneRenderMode = 'full' | 'peek' | 'spine'

/** Which panes may collapse when another is focused. */
export type CollapsePolicy =
	/** Nobody collapses; the proportional split. */
	| 'none'
	/** Everything unfocused collapses to a spine. */
	| 'all'
	/**
	 * The pane next to the focused one stays readable, the rest collapse.
	 *
	 * This is the interesting middle: reading a message while glancing at the
	 * event that produced it is a real pairing, and reading a message while
	 * glancing at the subagent roster is not.
	 */
	| 'far'

export type PaneId = 'events' | 'context' | 'rail'

/** The pane that holds content rather than an index of it. */
const READER: PaneId = 'context'

export type PaneSlot = {
	readonly id: PaneId
	readonly width: number
	readonly mode: PaneRenderMode
}

/**
 * A spine is a border, one column of label, and a border.
 *
 * Two columns of border for one of content looks wasteful written down, and is
 * the whole point: the border is what makes the spine read as a closed pane
 * rather than as a stray column of letters.
 */
export const SPINE_WIDTH = 3

/** Below this a peek is not readable and should have collapsed instead. */
export const PEEK_WIDTH = 28

/** The focused pane is never squeezed under this, whatever the policy. */
const FOCUS_FLOOR = 40

/**
 * A pane's label, top to bottom, for a spine of `height` rows.
 *
 * Truncated with a middle ellipsis rather than a tail cut, because the first
 * and last characters are what distinguish `EVENTS` from `EVENTS · CHANGES`
 * when only a few rows are available.
 */
export const spineLabel = (label: string, height: number): ReadonlyArray<string> => {
	const letters = Array.from(label.toUpperCase().replaceAll(' ', ''))
	if (height <= 0) return []
	if (letters.length <= height) return letters
	if (height === 1) return [letters[0] ?? '']
	const head = Math.ceil((height - 1) / 2)
	const tail = height - 1 - head
	return [...letters.slice(0, head), '·', ...(tail === 0 ? [] : letters.slice(-tail))]
}

/**
 * Lay the panes out for a focused pane and a collapse policy.
 *
 * Panes that are not resident (a rail with no subagents) are dropped entirely
 * rather than collapsed: a spine for a pane that does not exist is a button
 * that opens nothing.
 *
 * The focused pane keeps a floor. If honouring the policy would push it under
 * that floor there is nothing to be gained by collapsing further, so the policy
 * is relaxed rather than the floor broken.
 */
export const stackLayout = (
	totalWidth: number,
	resident: ReadonlyArray<PaneId>,
	focused: PaneId | null,
	policy: CollapsePolicy,
	spread: Readonly<Record<PaneId, number>>,
): ReadonlyArray<PaneSlot> => {
	const panes = resident.filter((id) => spread[id] > 0)
	if (panes.length === 0) return []
	if (focused === null || policy === 'none' || !panes.includes(focused))
		return panes.map((id) => ({ id, width: spread[id], mode: 'full' as const }))

	// `far` keeps the reader readable; `all` keeps nobody. Focusing the reader
	// itself has nothing to pair with, so it behaves as `all`.
	const peeks: ReadonlyArray<PaneId> =
		policy === 'far' && focused !== READER ? panes.filter((id) => id === READER) : []

	const modeFor = (id: PaneId): PaneRenderMode => (id === focused ? 'full' : peeks.includes(id) ? 'peek' : 'spine')

	const widthFor = (id: PaneId): number => (modeFor(id) === 'peek' ? PEEK_WIDTH : SPINE_WIDTH)
	const others = panes.filter((id) => id !== focused)
	const spent = others.reduce((sum, id) => sum + widthFor(id), 0)
	const focusWidth = totalWidth - spent

	// A peek that starves the focused pane is worse than no peek: the point of
	// collapsing was to give the focused pane room.
	if (focusWidth < FOCUS_FLOOR && peeks.length > 0) return stackLayout(totalWidth, resident, focused, 'all', spread)
	if (focusWidth < FOCUS_FLOOR) return panes.map((id) => ({ id, width: spread[id], mode: 'full' as const }))

	return panes.map((id) => ({
		id,
		width: id === focused ? focusWidth : widthFor(id),
		mode: modeFor(id),
	}))
}
