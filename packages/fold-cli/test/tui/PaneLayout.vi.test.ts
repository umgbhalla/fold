import { describe, expect, it } from 'vitest'

import { paneWidths, railInnerWidth, railWidthFor } from '../../src/tui/PaneLayout'

const widths = [80, 100, 110, 120, 140, 160, 200]

describe('railWidthFor', () => {
	it('gives the rail no columns when there are no subagents', () => {
		for (const width of widths) expect(railWidthFor(width, 0)).toBe(0)
	})

	/**
	 * The 100-column capture is the argument: a resident rail there rendered
	 * every agent as an empty description, so it was spending a quarter of the
	 * screen to say nothing.
	 */
	it('gives the rail no columns on a narrow terminal even with agents', () => {
		expect(railWidthFor(80, 15)).toBe(0)
		expect(railWidthFor(100, 15)).toBe(0)
		expect(railWidthFor(109, 15)).toBe(0)
	})

	it('becomes resident at 110 columns', () => {
		expect(railWidthFor(110, 1)).toBe(30)
	})

	it('widens once the terminal can afford it', () => {
		expect(railWidthFor(139, 1)).toBe(30)
		expect(railWidthFor(140, 1)).toBe(44)
		expect(railWidthFor(200, 1)).toBe(44)
	})

	it('never widens with agent count, only with terminal width', () => {
		expect(railWidthFor(160, 1)).toBe(railWidthFor(160, 15))
	})
})

describe('railInnerWidth', () => {
	it('removes the two border columns', () => {
		expect(railInnerWidth(44)).toBe(42)
		expect(railInnerWidth(30)).toBe(28)
	})

	it('never goes negative', () => {
		expect(railInnerWidth(0)).toBe(0)
	})
})

describe('paneWidths', () => {
	it('spends every column and no more', () => {
		for (const width of widths) {
			for (const agents of [0, 1, 15]) {
				const panes = paneWidths(width, agents)
				expect(panes.events + panes.context + panes.rail, `${width} cols, ${agents} agents`).toBe(width)
			}
		}
	})

	/**
	 * The reader was the smallest pane at every width below 118, which is the
	 * inversion this rule exists to correct.
	 */
	it('always gives the reader more room than the index', () => {
		for (const width of widths) {
			for (const agents of [0, 1, 15]) {
				const panes = paneWidths(width, agents)
				expect(panes.context, `${width} cols, ${agents} agents`).toBeGreaterThan(panes.events)
			}
		}
	})

	it('hands the rail columns to the reader when there are no agents', () => {
		const withAgents = paneWidths(160, 3)
		const without = paneWidths(160, 0)
		expect(without.rail).toBe(0)
		expect(without.context).toBe(withAgents.context + withAgents.rail)
	})

	it('stops growing the index once it is wide enough to read', () => {
		expect(paneWidths(200, 0).events).toBe(52)
		expect(paneWidths(300, 0).events).toBe(52)
	})

	it('keeps the index usable on a narrow terminal', () => {
		expect(paneWidths(80, 0).events).toBeGreaterThanOrEqual(24)
	})
})

describe('focus', () => {
	it('gives the focused pane more room than it has unfocused', () => {
		for (const focused of ['events', 'context', 'rail'] as const) {
			const idle = paneWidths(160, 3)
			const active = paneWidths(160, 3, focused)
			expect(active[focused], `${focused} focused`).toBeGreaterThan(idle[focused])
		}
	})

	it('takes those columns from the panes you are not in', () => {
		const idle = paneWidths(160, 3)
		const active = paneWidths(160, 3, 'context')
		expect(active.events).toBeLessThan(idle.events)
		expect(active.rail).toBeLessThan(idle.rail)
	})

	/** The row is the terminal; growing one pane may never overrun it. */
	it('still spends exactly the terminal width', () => {
		for (const width of widths) {
			for (const agents of [0, 1, 15]) {
				for (const focused of [null, 'events', 'context', 'rail'] as const) {
					const panes = paneWidths(width, agents, focused)
					expect(panes.events + panes.context + panes.rail, `${width}/${agents}/${focused}`).toBe(width)
				}
			}
		}
	})

	it('leaves the panes you are not in readable', () => {
		for (const width of [110, 140, 160, 200]) {
			for (const focused of ['events', 'context', 'rail'] as const) {
				const panes = paneWidths(width, 3, focused)
				expect(panes.events, `${width} events`).toBeGreaterThanOrEqual(20)
				expect(panes.context, `${width} context`).toBeGreaterThanOrEqual(24)
				expect(panes.rail, `${width} rail`).toBeGreaterThanOrEqual(24)
			}
		}
	})

	/** A rail that is not on screen has nothing to lend and nothing to claim. */
	it('changes nothing when the focused pane is not rendered', () => {
		expect(paneWidths(160, 0, 'rail')).toEqual(paneWidths(160, 0))
		expect(paneWidths(100, 15, 'rail')).toEqual(paneWidths(100, 15))
	})

	it('does not let a collapsed rail lend columns it does not have', () => {
		const panes = paneWidths(100, 0, 'context')
		expect(panes.rail).toBe(0)
		expect(panes.events + panes.context).toBe(100)
	})

	it('is stable: focusing the same pane twice gives the same layout', () => {
		expect(paneWidths(160, 3, 'context')).toEqual(paneWidths(160, 3, 'context'))
	})
})
