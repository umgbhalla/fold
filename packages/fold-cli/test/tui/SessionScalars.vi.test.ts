import { describe, expect, it } from 'vitest'

import { compactCost, compactTokens, sessionScalarsLine, toolTallyLine } from '../../src/tui/SessionScalars'

const glyphFor = (name: string): string =>
	name === 'bash' ? '⚙' : name === 'read' ? '▤' : name === 'subagent' ? '★' : '◆'

describe('compactTokens', () => {
	it('leaves a small count alone', () => {
		expect(compactTokens(0)).toBe('0')
		expect(compactTokens(999)).toBe('999')
	})

	it('keeps a digit of precision in the low thousands', () => {
		expect(compactTokens(1_200)).toBe('1.2k')
		expect(compactTokens(9_900)).toBe('9.9k')
	})

	it('drops the decimal once it stops mattering', () => {
		expect(compactTokens(12_400)).toBe('12k')
		expect(compactTokens(180_000)).toBe('180k')
	})

	it('goes to millions', () => {
		expect(compactTokens(1_500_000)).toBe('1.5m')
	})
})

describe('compactCost', () => {
	/** Precision follows magnitude: 4dp is right for a fraction of a cent, absurd for twelve dollars. */
	it('keeps four places for a fraction of a cent', () => {
		expect(compactCost(0.0042)).toBe('$0.0042')
	})

	it('keeps three below a dollar', () => {
		expect(compactCost(0.421)).toBe('$0.421')
	})

	it('keeps two above a dollar', () => {
		expect(compactCost(12.3456)).toBe('$12.35')
	})

	it('renders nothing spent as a plain zero', () => {
		expect(compactCost(0)).toBe('$0')
	})
})

describe('sessionScalarsLine', () => {
	const full = { contextTokens: 12_400, contextPercent: 6, costUsd: 0.42, turns: 13, agents: 2 }

	it('renders every scalar that has something to say', () => {
		expect(sessionScalarsLine(full)).toBe('12k ctx (6%) · $0.420 · 13 turns · 2 agents')
	})

	/**
	 * The old panel rendered an em dash for each unknown, which reads as a value
	 * at a glance. A scalar with nothing to say is left out instead.
	 */
	it('omits a scalar rather than showing a placeholder', () => {
		expect(sessionScalarsLine({ contextTokens: 0, contextPercent: null, costUsd: null, turns: 0, agents: 0 })).toBe(
			'',
		)
	})

	it('omits cost when the model publishes no pricing', () => {
		expect(sessionScalarsLine({ ...full, costUsd: null })).toBe('12k ctx (6%) · 13 turns · 2 agents')
	})

	it('omits the window share when the context window is unknown', () => {
		expect(sessionScalarsLine({ ...full, contextPercent: null })).toBe('12k ctx · $0.420 · 13 turns · 2 agents')
	})

	it('omits agents when the session has none', () => {
		expect(sessionScalarsLine({ ...full, agents: 0 })).toBe('12k ctx (6%) · $0.420 · 13 turns')
	})

	it('agrees with itself about singular and plural', () => {
		expect(sessionScalarsLine({ ...full, turns: 1, agents: 1 })).toContain('1 turn · 1 agent')
	})
})

describe('toolTallyLine', () => {
	const calls = [
		['bash', 34],
		['read', 21],
		['subagent', 4],
	] as const

	it('renders the tally with the total pinned right', () => {
		const line = toolTallyLine(calls, glyphFor, 30)
		expect(line).toContain('⚙34')
		expect(line).toContain('▤21')
		expect(line.trimEnd().endsWith('59⚒')).toBe(true)
		expect(line.length).toBe(30)
	})

	it('never exceeds the width it was given', () => {
		for (const width of [10, 16, 22, 28, 42]) {
			expect(toolTallyLine(calls, glyphFor, width).length, `width ${width}`).toBeLessThanOrEqual(width)
		}
	})

	/** The total is the point; entries drop before it does. */
	it('drops the least used entries before the total', () => {
		const line = toolTallyLine(calls, glyphFor, 12)
		expect(line).toContain('59⚒')
		expect(line).not.toContain('★4')
	})

	it('renders nothing when no tool has been called', () => {
		expect(toolTallyLine([], glyphFor, 30)).toBe('')
	})
})
