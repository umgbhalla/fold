/**
 * One-line row layout where the fixed cells yield before the identifying one.
 *
 * Every rail row today is a hand-rolled table of `<text width={n}>` cells with a
 * single `flexGrow` cell. Flexbox shrinks the flexible cell first, so the field
 * that identifies the row is exactly the field that disappears: at 100 columns
 * fifteen subagents all render as `▌  57y  ◓ RUNNING`, twelve columns spent
 * spelling a status that the glyph beside it already gives.
 *
 * These helpers invert that. The caller states what each cell is worth, and the
 * cells are dropped in order of least worth until the row fits, so the subject
 * keeps its columns and the decoration goes first.
 */

/** A cell in a single-line row. */
export type RowCell = {
	/** The text to render. */
	readonly text: string
	/**
	 * How much of the row this cell may claim when space is short.
	 *
	 * - `subject`: the field that identifies the row. Truncated, never dropped.
	 * - `required`: small and load-bearing, such as a status glyph. Never dropped.
	 * - `optional`: dropped whole once the row no longer fits.
	 */
	readonly weight: 'subject' | 'required' | 'optional'
	/**
	 * Drop order within `optional`, lowest first. Cells with the same priority
	 * are dropped right to left.
	 */
	readonly priority?: number
	/** Minimum useful width for a subject cell; below this the row is not worth rendering. */
	readonly minWidth?: number
}

const ELLIPSIS = '…'

/**
 * Truncate to `width`, cutting from the middle.
 *
 * The middle goes rather than the tail because the tail is usually what
 * discriminates: `Overflow task 1` and `Overflow task 12` truncate to the same
 * string from the right, and so do `src/tui/MetaRail.tsx` and
 * `src/tui/MarkdownText.tsx`. A list of rows that are individually readable but
 * mutually indistinguishable is worse than one that is obviously elided, which
 * is what the rail did at 120 columns before this existed.
 *
 * A width of one renders the ellipsis alone rather than a single letter, since
 * one letter reads as noise while `…` reads as "there is more".
 */
export const clampCell = (value: string, width: number): string => {
	if (width <= 0) return ''
	if (value.length <= width) return value
	if (width === 1) return ELLIPSIS
	const keep = width - 1
	const head = Math.ceil(keep / 2)
	const tail = keep - head
	if (tail === 0) return `${value.slice(0, head).trimEnd()}${ELLIPSIS}`
	return `${value.slice(0, head).trimEnd()}${ELLIPSIS}${value.slice(value.length - tail)}`
}

const gapsFor = (count: number, gap: number): number => (count <= 1 ? 0 : (count - 1) * gap)

/**
 * Fit cells into `width`, dropping optional cells in priority order and
 * truncating the subject with whatever is left.
 *
 * Returns the rendered strings for the cells that survived, in their original
 * order, along with the width each occupies. The caller renders them with fixed
 * widths, so nothing reflows afterwards.
 */
export const fitRow = (
	cells: ReadonlyArray<RowCell>,
	width: number,
	options: { readonly gap?: number } = {},
): ReadonlyArray<{ readonly text: string; readonly width: number; readonly index: number }> => {
	const gap = options.gap ?? 1
	const kept = cells.map((cell, index) => ({ cell, index }))
	const optionalOrder = kept
		.filter(({ cell }) => cell.weight === 'optional')
		.toSorted((left, right) => {
			const byPriority = (left.cell.priority ?? 0) - (right.cell.priority ?? 0)
			return byPriority !== 0 ? byPriority : right.index - left.index
		})

	const dropped = new Set<number>()
	const fits = (): boolean => {
		const live = kept.filter(({ index }) => !dropped.has(index))
		const fixed = live
			.filter(({ cell }) => cell.weight !== 'subject')
			.reduce((total, { cell }) => total + cell.text.length, 0)
		const subjects = live.filter(({ cell }) => cell.weight === 'subject')
		const subjectMin = subjects.reduce((total, { cell }) => total + (cell.minWidth ?? 1), 0)
		return fixed + subjectMin + gapsFor(live.length, gap) <= width
	}

	for (const candidate of optionalOrder) {
		if (fits()) break
		dropped.add(candidate.index)
	}

	const live = kept.filter(({ index }) => !dropped.has(index))
	const fixedWidth = live
		.filter(({ cell }) => cell.weight !== 'subject')
		.reduce((total, { cell }) => total + cell.text.length, 0)
	const subjects = live.filter(({ cell }) => cell.weight === 'subject')
	const available = Math.max(0, width - fixedWidth - gapsFor(live.length, gap))

	// Subjects share what is left; with one subject, which is the normal case,
	// it simply takes all of it.
	const perSubject = subjects.length === 0 ? 0 : Math.floor(available / subjects.length)
	let remainder = subjects.length === 0 ? 0 : available - perSubject * subjects.length

	return live.map(({ cell, index }) => {
		if (cell.weight !== 'subject') return { text: cell.text, width: cell.text.length, index }
		const extra = remainder > 0 ? 1 : 0
		remainder -= extra
		const cellWidth = perSubject + extra
		return { text: clampCell(cell.text, cellWidth), width: cellWidth, index }
	})
}

/**
 * Render a fitted row to a single string, for tests and for any caller that
 * wants one `<text>` rather than a box of cells.
 */
export const renderRow = (
	cells: ReadonlyArray<RowCell>,
	width: number,
	options: { readonly gap?: number } = {},
): string => {
	const gap = options.gap ?? 1
	const fitted = fitRow(cells, width, options)
	return fitted
		.map(({ text, width: cellWidth }) => text.padEnd(cellWidth, ' '))
		.join(' '.repeat(gap))
		.trimEnd()
}
