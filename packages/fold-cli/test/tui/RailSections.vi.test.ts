import { describe, expect, it } from 'vitest'

import { railSections, type RailSection } from '../../src/tui/RailSections'

const section = (
	id: string,
	label: string,
	icon: string,
	lastTouched: number,
	extra: Partial<RailSection> = {},
): RailSection => ({ id, label, icon, lastTouched, ...extra })

const six: ReadonlyArray<RailSection> = [
	section('subagents', 'SUBAGENTS', '★', 6, { count: 3 }),
	section('skills', 'SKILLS', '✦', 5),
	section('changes', 'CHANGES', '⎇', 4, { count: 2 }),
	section('settings', 'SETTINGS', '⚙', 3),
	section('models', 'MODELS', '◆', 2),
	section('logs', 'LOGS', '▤', 1),
]

describe('railSections', () => {
	it('spends detail on the most recent and leaves the rest as glyphs', () => {
		const views = railSections(six, 40)
		expect(views[0]?.id).toBe('subagents')
		expect(views[0]?.detail).toBe('full')
		// The oldest ones cannot all be spelled out in 40 rows.
		expect(views.at(-1)?.detail).toBe('icon')
		expect(views.at(-1)?.text).toBe('▤')
	})

	it('never exceeds the height it is given', () => {
		for (let height = 6; height <= 60; height += 1) {
			const total = railSections(six, height).reduce((sum, view) => sum + view.rows, 0)
			expect(total, `height ${height}`).toBeLessThanOrEqual(height)
		}
	})

	/** Everything fits as an icon, so a tiny rail still lists every section. */
	it('shows every section even when only glyphs fit', () => {
		// Six icons cost 20 rows: 1 glyph + 2 border each, plus a row for the two
		// sections that carry a count.
		const views = railSections(six, 20)
		expect(views).toHaveLength(6)
		expect(views.every((view) => view.detail === 'icon')).toBe(true)
	})

	it('gives more sections a name as the rail gets taller', () => {
		const named = (height: number) => railSections(six, height).filter((view) => view.detail !== 'icon').length
		expect(named(20)).toBe(0)
		expect(named(60)).toBeGreaterThan(named(30))
	})

	/**
	 * Position is identity in a sidebar, so nothing reorders. Recency and
	 * activity decide how much of a section is spelled out, never where it sits.
	 */
	it('never reorders, whatever the recency', () => {
		const order = six.map((item) => item.id)
		expect(railSections(six, 40).map((view) => view.id)).toEqual(order)
		const shuffledRecency = six.map((item, index) => ({ ...item, lastTouched: index }))
		expect(railSections(shuffledRecency, 40).map((view) => view.id)).toEqual(order)
	})

	/**
	 * A subagent finishing while you are reading something else earns its
	 * section a name, without moving it up the column.
	 */
	it('spends detail on an active section without moving it', () => {
		const withActive = six.map((item) => (item.id === 'logs' ? { ...item, active: true } : item))
		const views = railSections(withActive, 30)
		expect(views.map((view) => view.id)).toEqual(six.map((item) => item.id))
		expect(views.find((view) => view.id === 'logs')?.detail).not.toBe('icon')
	})

	it('keeps counts so a collapsed section can still say what arrived', () => {
		const views = railSections(six, 40)
		expect(views.find((view) => view.id === 'subagents')?.count).toBe(3)
		expect(views.find((view) => view.id === 'skills')?.count).toBeUndefined()
	})

	it('returns nothing for no sections or no room', () => {
		expect(railSections([], 40)).toEqual([])
		expect(railSections(six, 0)).toEqual([])
	})
})
