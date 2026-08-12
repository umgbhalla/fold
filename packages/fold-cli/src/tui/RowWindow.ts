/**
 * Rendering only the rows a scrollbox can actually show.
 *
 * OpenTUI does not window long lists. A scrollbox lays out every child on
 * every frame whether or not it is on screen, so a transcript costs what it
 * has accumulated rather than what it is displaying. Measured while streaming
 * into transcripts of 100, 400 and 1200 rows: 63 ms, 158 ms and 510 ms of
 * store-apply per 150 frames, against roughly forty rows visible throughout.
 *
 * The fix is to render a slice and replace what is left with two spacer boxes
 * of the right height, so the scrollbar, the scroll offset and every
 * `scrollChildIntoView` target still behave as though the whole list were
 * there.
 *
 * This only works because index rows are exactly one line tall. A list of
 * variable-height rows needs measured offsets, which is a different and much
 * larger problem; the transcript index is the one place in this TUI where the
 * cheap version is correct.
 */

/** What to render, and how much empty space to leave on each side. */
export type RowWindow = {
	/** First index to render, inclusive. */
	readonly start: number
	/** Last index to render, exclusive. */
	readonly end: number
	/** Rows skipped above, as height for a spacer. */
	readonly leading: number
	/** Rows skipped below, as height for a spacer. */
	readonly trailing: number
}

/**
 * Rows rendered beyond the viewport on each side.
 *
 * Scrolling reveals rows one at a time, so a margin of one would be correct
 * and would rebuild the slice on every keypress. A margin absorbs a page of
 * movement before the window has to change, which matters because changing it
 * is what costs.
 */
const OVERSCAN = 20

/**
 * The slice to render for a viewport of `height` rows scrolled to `scrollTop`.
 *
 * Both are in rows, not cells, and the caller is responsible for that being
 * true: this is only correct for a list whose rows are one line tall.
 */
export const rowWindow = (total: number, height: number, scrollTop: number): RowWindow => {
	if (total <= 0) return { start: 0, end: 0, leading: 0, trailing: 0 }
	// Height is zero until the first layout pass has run, and a window of
	// nothing renders an empty list that says "waiting for events" over a
	// transcript that has plenty. Falling back to the whole list is correct
	// rather than merely safe: the next scroll event brings a real height.
	if (height <= 0) return { start: 0, end: total, leading: 0, trailing: 0 }

	// A viewport taller than the list, or a list short enough that windowing
	// would cost more than it saves, renders whole. The spacers are not free:
	// they are two more renderables and a layout pass each.
	if (total <= height + OVERSCAN * 2) return { start: 0, end: total, leading: 0, trailing: 0 }

	const first = Math.max(0, Math.floor(scrollTop) - OVERSCAN)
	const last = Math.min(total, Math.ceil(scrollTop + height) + OVERSCAN)
	return { start: first, end: last, leading: first, trailing: total - last }
}

/**
 * Whether a window still covers the viewport after a scroll.
 *
 * Recomputing the slice on every scroll event would rebuild the rendered rows
 * every keypress, which is the cost this module exists to avoid. The window is
 * only replaced once the viewport has moved into the overscan margin.
 */
export const windowCovers = (window: RowWindow, total: number, height: number, scrollTop: number): boolean => {
	if (window.end === total && window.start === 0) return true
	const top = Math.floor(scrollTop)
	const bottom = Math.ceil(scrollTop + height)
	return window.start <= top && window.end >= Math.min(total, bottom)
}
