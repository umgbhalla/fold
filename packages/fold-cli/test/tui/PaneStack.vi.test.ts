import { describe, expect, it } from 'vitest'

import { PEEK_WIDTH, SPINE_WIDTH, spineLabel, stackLayout, type PaneId } from '../../src/tui/PaneStack'

const spread: Record<PaneId, number> = { events: 47, context: 79, rail: 44 }
const resident: ReadonlyArray<PaneId> = ['events', 'context', 'rail']
const total = 170

describe('spineLabel', () => {
	it('reads top to bottom, one letter per row', () => {
		expect(spineLabel('rail', 8)).toEqual(['R', 'A', 'I', 'L'])
	})

	/** The ends are what tell two similar labels apart. */
	it('keeps both ends when the label is taller than the pane', () => {
		// Head is the larger half, so five rows of SUBAGENTS keeps SU and TS.
		expect(spineLabel('subagents', 5)).toEqual(['S', 'U', '·', 'T', 'S'])
	})

	it('never returns more rows than it was given', () => {
		for (let height = 0; height <= 12; height += 1) {
			expect(spineLabel('context', height).length, `height ${height}`).toBeLessThanOrEqual(height)
		}
	})
})

describe('stackLayout', () => {
	it('leaves the spread alone when nothing is focused', () => {
		const slots = stackLayout(total, resident, null, 'all', spread)
		expect(slots.map((slot) => slot.mode)).toEqual(['full', 'full', 'full'])
		expect(slots.map((slot) => slot.width)).toEqual([47, 79, 44])
	})

	it('collapses every other pane to a spine under "all"', () => {
		const slots = stackLayout(total, resident, 'context', 'all', spread)
		expect(slots.map((slot) => slot.mode)).toEqual(['spine', 'full', 'spine'])
		// The focused pane takes everything the spines did not.
		expect(slots.find((slot) => slot.id === 'context')?.width).toBe(total - 2 * SPINE_WIDTH)
	})

	it('keeps the immediate neighbours readable under "far"', () => {
		const slots = stackLayout(total, resident, 'events', 'far', spread)
		// events is at one end, so only context is adjacent.
		expect(slots.map((slot) => slot.mode)).toEqual(['full', 'peek', 'spine'])
		expect(slots.find((slot) => slot.id === 'context')?.width).toBe(PEEK_WIDTH)
	})

	it('always fills the terminal exactly', () => {
		for (const policy of ['none', 'all', 'far'] as const) {
			for (const focused of [...resident, null]) {
				const slots = stackLayout(total, resident, focused, policy, spread)
				const sum = slots.reduce((acc, slot) => acc + slot.width, 0)
				expect(sum, `${policy}/${focused}`).toBe(total)
			}
		}
	})

	/**
	 * A peek is only worth its columns if the focused pane still has room. On a
	 * narrow terminal it does not, so the peek has to give way rather than the
	 * focused pane being squeezed.
	 */
	it('drops the peek rather than starving the focused pane', () => {
		const narrow = { events: 22, context: 24, rail: 24 }
		// 70 - spine(3) - peek(28) leaves 39 for the focused pane, under the floor,
		// so the peek must give way. Two spines leave 64, which clears it.
		const slots = stackLayout(70, resident, 'rail', 'far', narrow)
		expect(slots.map((slot) => slot.mode)).toEqual(['spine', 'spine', 'full'])
		expect(slots.find((slot) => slot.id === 'rail')?.width).toBe(70 - 2 * SPINE_WIDTH)
	})

	/** A pane that is not on screen gets no spine: it would open nothing. */
	it('drops a pane that is not resident instead of collapsing it', () => {
		const slots = stackLayout(total, ['events', 'context'], 'context', 'all', { ...spread, rail: 0 })
		expect(slots.map((slot) => slot.id)).toEqual(['events', 'context'])
		expect(slots.reduce((acc, slot) => acc + slot.width, 0)).toBe(total)
	})

	it('falls back to the spread when even collapsing cannot free enough', () => {
		const tiny = { events: 20, context: 20, rail: 0 }
		const slots = stackLayout(40, ['events', 'context'], 'context', 'all', tiny)
		expect(slots.map((slot) => slot.mode)).toEqual(['full', 'full'])
	})
})
