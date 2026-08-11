import { describe, expect, it } from 'vitest'

import { clampCell, fitRow, renderRow, type RowCell } from '../../src/tui/RowLayout'

const subagentRow = (description: string, type: string, age: string, status: string): ReadonlyArray<RowCell> => [
	{ text: status, weight: 'required' },
	{ text: description, weight: 'subject', minWidth: 6 },
	{ text: type, weight: 'optional', priority: 0 },
	{ text: age, weight: 'optional', priority: 1 },
]

describe('clampCell', () => {
	it('leaves a value that fits untouched', () => {
		expect(clampCell('bash', 10)).toBe('bash')
	})

	it('cuts the middle so the discriminating tail survives', () => {
		expect(clampCell('Overflow task 12', 10)).toBe('Overf…k 12')
	})

	it('keeps apart two values that share a prefix', () => {
		expect(clampCell('Overflow task 1', 10)).not.toBe(clampCell('Overflow task 12', 10))
	})

	it('renders a single column as the ellipsis alone', () => {
		expect(clampCell('Overflow task 12', 1)).toBe('…')
	})

	it('renders nothing at zero width', () => {
		expect(clampCell('Overflow task 12', 0)).toBe('')
	})

	it('does not leave a space before the ellipsis', () => {
		expect(clampCell('Overflow task 12', 10)).not.toContain(' …')
	})
})

describe('fitRow', () => {
	it('keeps every cell when the row fits', () => {
		const fitted = fitRow(subagentRow('Overflow task 12', 'researcher', '4m', '◐'), 40)
		expect(fitted.map((cell) => cell.index)).toEqual([0, 1, 2, 3])
	})

	it('gives the subject the slack when the row is wide', () => {
		const fitted = fitRow(subagentRow('task', 'rsch', '4m', '◐'), 40)
		const subject = fitted.find((cell) => cell.index === 1)
		expect(subject?.width).toBeGreaterThan('task'.length)
	})

	/**
	 * The regression this whole module exists for: at 26 inner columns the old
	 * rail rendered `▌     57y  ◓ RUNNING` for every agent, because flexbox
	 * shrank the description and left the decoration at full width.
	 */
	it('drops decoration before the subject when space runs out', () => {
		const fitted = fitRow(subagentRow('Overflow task 12', 'researcher', '4m', '◐'), 18)
		const subject = fitted.find((cell) => cell.index === 1)
		expect(subject).toBeDefined()
		expect(subject?.text.length).toBeGreaterThanOrEqual(6)
		expect(fitted.some((cell) => cell.index === 2)).toBe(false)
	})

	it('drops the lowest priority optional cell first', () => {
		const fitted = fitRow(subagentRow('Overflow task 12', 'researcher', '4m', '◐'), 18)
		expect(fitted.some((cell) => cell.index === 2)).toBe(false)
		expect(fitted.some((cell) => cell.index === 3)).toBe(true)
	})

	it('never drops a required cell', () => {
		const fitted = fitRow(subagentRow('Overflow task 12', 'researcher', '4m', '◐'), 8)
		expect(fitted.some((cell) => cell.index === 0)).toBe(true)
	})

	it('keeps the subject even when nothing else survives', () => {
		const fitted = fitRow(subagentRow('Overflow task 12', 'researcher', '4m', '◐'), 9)
		expect(fitted.map((cell) => cell.index)).toEqual([0, 1])
	})

	it('shares the slack between two subjects', () => {
		const fitted = fitRow(
			[
				{ text: 'left side text', weight: 'subject', minWidth: 4 },
				{ text: 'right side text', weight: 'subject', minWidth: 4 },
			],
			21,
		)
		expect(fitted.map((cell) => cell.width)).toEqual([10, 10])
	})
})

describe('renderRow', () => {
	it('never exceeds the width it was given', () => {
		for (const width of [8, 12, 18, 22, 26, 30, 40, 56]) {
			const line = renderRow(subagentRow('Overflow task 12', 'researcher', '4m', '◐'), width)
			expect(line.length, `width ${width} rendered ${line.length}: ${line}`).toBeLessThanOrEqual(width)
		}
	})

	it('still identifies the row at the width that used to erase it', () => {
		const line = renderRow(subagentRow('Overflow task 12', 'researcher', '4m', '◐'), 26)
		expect(line).toContain('Overf')
		expect(line).toContain('12')
	})

	it('distinguishes rows that differ only in their tail at narrow widths', () => {
		const first = renderRow(subagentRow('Overflow task 1', 'researcher', '4m', '◐'), 26)
		const second = renderRow(subagentRow('Overflow task 12', 'researcher', '4m', '◐'), 26)
		expect(first).not.toBe(second)
	})

	it('separates cells so they cannot collide', () => {
		const line = renderRow(subagentRow('Overflow task 12', 'rsch', '4m', '◐'), 34)
		expect(line).not.toMatch(/[a-z]\d+[a-z]/)
		expect(line).toContain(' 4m')
	})
})
