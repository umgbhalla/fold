import { describe, expect, it } from 'vitest'

import { metaBarRows, metaDensity, shareBar } from '../../src/tui/MetaDensity'

describe('metaDensity', () => {
	it('expands only when the pane is focused and has room', () => {
		expect(metaDensity(66, 40, true)).toBe('expanded')
		expect(metaDensity(66, 40, false)).toBe('line')
	})

	/** An unfocused rail is 30 columns, which cannot hold label, bar and count. */
	it('stays on one line when the pane is too narrow', () => {
		expect(metaDensity(30, 40, true)).toBe('line')
	})

	/**
	 * Caught by looking at it: at 14 rows the expanded block was taller than the
	 * pane and printed through the border into the status bar.
	 */
	it('stays on one line when the terminal is too short to contain the block', () => {
		expect(metaDensity(66, 14, true)).toBe('line')
		expect(metaDensity(66, 24, true)).toBe('line')
		expect(metaDensity(66, 26, true)).toBe('expanded')
	})
})

describe('shareBar', () => {
	it('fills in proportion to the share of the total, not the largest member', () => {
		// One item out of a two-item series is half the work, not all of it.
		expect(shareBar(5, 10, 10)).toBe('█████·····')
		expect(shareBar(10, 10, 10)).toBe('██████████')
	})

	it('draws an empty track rather than a full bar for a lone item', () => {
		// The bug this replaces: normalising against the largest member drew
		// `██████████ 1` for a single researcher.
		expect(shareBar(1, 4, 8)).toBe('██······')
	})

	it('is always exactly the width it is given', () => {
		for (let width = 0; width <= 40; width += 1) {
			expect(shareBar(3, 7, width).length, `width ${width}`).toBe(width)
		}
	})

	it('does not divide by zero on an empty series', () => {
		expect(shareBar(0, 0, 6)).toBe('······')
	})
})

describe('metaBarRows', () => {
	const series = [
		['bash', 21],
		['read', 9],
		['subagent', 3],
	] as const

	it('aligns the bars into a column by padding labels to the widest', () => {
		const rows = metaBarRows(series, 40, 10)
		const labelWidths = new Set(rows.map((row) => row.label.length))
		expect(labelWidths.size, 'labels should all be the same width').toBe(1)
	})

	it('keeps every row inside the width it is given', () => {
		for (let width = 12; width <= 66; width += 1) {
			for (const row of metaBarRows(series, width, 10)) {
				const rendered = `${row.label} ${row.bar} ${row.count}`
				expect(rendered.length, `width ${width}: "${rendered}"`).toBeLessThanOrEqual(width)
			}
		}
	})

	it('truncates a label rather than letting it push the count off the row', () => {
		const long = [['an-extremely-long-tool-name', 4]] as const
		const rows = metaBarRows(long, 24, 10)
		expect(rows[0]?.label.endsWith('…')).toBe(true)
		expect(`${rows[0]?.label} ${rows[0]?.bar} ${rows[0]?.count}`.length).toBeLessThanOrEqual(24)
	})

	it('shows at most the rows it is allowed', () => {
		expect(metaBarRows(series, 40, 2)).toHaveLength(2)
	})

	it('returns nothing for an empty series or no space', () => {
		expect(metaBarRows([], 40, 10)).toEqual([])
		expect(metaBarRows(series, 0, 10)).toEqual([])
		expect(metaBarRows(series, 40, 0)).toEqual([])
	})
})
