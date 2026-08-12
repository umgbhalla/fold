import { describe, expect, it } from 'vitest'

import { rowWindow, windowCovers } from '../../src/tui/RowWindow'

describe('rowWindow', () => {
	it('renders a short list whole, because spacers would cost more than they save', () => {
		expect(rowWindow(30, 40, 0)).toEqual({ start: 0, end: 30, leading: 0, trailing: 0 })
	})

	it('renders a slice of a long list', () => {
		const window = rowWindow(1000, 40, 500)
		expect(window.start).toBeLessThan(500)
		expect(window.end).toBeGreaterThan(540)
		// The rendered slice is a viewport plus overscan on each side, not 1000.
		expect(window.end - window.start).toBeLessThan(120)
	})

	/** The spacers stand in for the rows that are not rendered. */
	it('always accounts for every row', () => {
		for (const scrollTop of [0, 1, 250, 500, 960, 1000]) {
			const window = rowWindow(1000, 40, scrollTop)
			const rendered = window.end - window.start
			expect(window.leading + rendered + window.trailing, `scrollTop ${scrollTop}`).toBe(1000)
		}
	})

	it('covers the viewport at any scroll position', () => {
		for (let scrollTop = 0; scrollTop <= 960; scrollTop += 7) {
			const window = rowWindow(1000, 40, scrollTop)
			expect(window.start, `top at ${scrollTop}`).toBeLessThanOrEqual(scrollTop)
			expect(window.end, `bottom at ${scrollTop}`).toBeGreaterThanOrEqual(scrollTop + 40)
		}
	})

	it('clamps at both ends rather than running off the list', () => {
		expect(rowWindow(1000, 40, 0).start).toBe(0)
		expect(rowWindow(1000, 40, 0).leading).toBe(0)
		expect(rowWindow(1000, 40, 960).end).toBe(1000)
		expect(rowWindow(1000, 40, 960).trailing).toBe(0)
	})

	it('renders nothing for an empty list', () => {
		expect(rowWindow(0, 40, 0)).toEqual({ start: 0, end: 0, leading: 0, trailing: 0 })
	})

	/**
	 * Height is zero until the first layout pass. Windowing to nothing there
	 * renders "waiting for events" over a transcript that has plenty, which is
	 * exactly what the first version of this did.
	 */
	it('renders the whole list before the viewport has a height', () => {
		expect(rowWindow(100, 0, 0)).toEqual({ start: 0, end: 100, leading: 0, trailing: 0 })
	})
})

describe('windowCovers', () => {
	/**
	 * The window is only rebuilt once the viewport reaches the overscan margin.
	 * Rebuilding on every scroll event would re-render the rows on each
	 * keypress, which is the cost this module exists to avoid.
	 */
	it('survives a scroll inside the overscan margin', () => {
		const window = rowWindow(1000, 40, 500)
		expect(windowCovers(window, 1000, 40, 505)).toBe(true)
		expect(windowCovers(window, 1000, 40, 495)).toBe(true)
	})

	it('reports a miss once the viewport leaves the window', () => {
		const window = rowWindow(1000, 40, 500)
		expect(windowCovers(window, 1000, 40, 700)).toBe(false)
		expect(windowCovers(window, 1000, 40, 300)).toBe(false)
	})

	it('always covers a whole-list window', () => {
		const window = rowWindow(30, 40, 0)
		expect(windowCovers(window, 30, 40, 0)).toBe(true)
	})
})
