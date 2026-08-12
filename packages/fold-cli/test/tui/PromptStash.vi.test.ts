import { describe, expect, it } from 'vitest'

import {
	dropStash,
	MAX_STASH_ENTRIES,
	parseStash,
	pushStash,
	serializeStash,
	stashLabel,
	type StashEntry,
} from '../../src/tui/PromptStash'

const entry = (text: string, ts: number): StashEntry => ({ text, ts })

describe('parseStash', () => {
	it('round-trips through serialize', () => {
		const entries = [entry('first draft', 1), entry('second draft', 2)]
		expect(parseStash(serializeStash(entries))).toEqual(entries)
	})

	/**
	 * A stash is a convenience. Failing the file over one bad line would cost
	 * every draft to protect one.
	 */
	it('drops an unparseable line rather than the file', () => {
		const good = JSON.stringify(entry('kept', 1))
		expect(parseStash(`${good}\nnot json\n{"text":"no ts"}\n`)).toEqual([entry('kept', 1)])
	})

	it('reads an empty or blank file as empty', () => {
		expect(parseStash('')).toEqual([])
		expect(parseStash('\n\n  \n')).toEqual([])
	})

	it('keeps only the newest entries', () => {
		const many = Array.from({ length: MAX_STASH_ENTRIES + 10 }, (_, index) => entry(`draft ${index}`, index))
		const parsed = parseStash(serializeStash(many))
		expect(parsed).toHaveLength(MAX_STASH_ENTRIES)
		expect(parsed.at(-1)?.text).toBe(`draft ${MAX_STASH_ENTRIES + 9}`)
	})

	it('serializes an empty stash as an empty file, not a blank line', () => {
		expect(serializeStash([])).toBe('')
	})
})

describe('pushStash', () => {
	it('appends newest last', () => {
		const pushed = pushStash([entry('old', 1)], 'new', 2)
		expect(pushed.map((item) => item.text)).toEqual(['old', 'new'])
	})

	/** A stash full of blanks is worse than no stash. */
	it('refuses a blank draft', () => {
		expect(pushStash([], '   \n  ', 1)).toEqual([])
		expect(pushStash([], '', 1)).toEqual([])
	})

	it('drops the oldest once full', () => {
		const full = Array.from({ length: MAX_STASH_ENTRIES }, (_, index) => entry(`draft ${index}`, index))
		const pushed = pushStash(full, 'newest', 999)
		expect(pushed).toHaveLength(MAX_STASH_ENTRIES)
		expect(pushed[0]?.text).toBe('draft 1')
		expect(pushed.at(-1)?.text).toBe('newest')
	})
})

describe('dropStash', () => {
	it('removes the entry at an index', () => {
		const entries = [entry('a', 1), entry('b', 2), entry('c', 3)]
		expect(dropStash(entries, 1).map((item) => item.text)).toEqual(['a', 'c'])
	})

	it('ignores an index that is not there', () => {
		const entries = [entry('a', 1)]
		expect(dropStash(entries, -1)).toEqual(entries)
		expect(dropStash(entries, 5)).toEqual(entries)
	})
})

describe('stashLabel', () => {
	/**
	 * A draft whose first line is short but whose second line is the point would
	 * be unidentifiable if newlines truncated instead of collapsing.
	 */
	it('collapses newlines rather than cutting at the first', () => {
		expect(stashLabel(entry('fix the\nrail width bug', 1), 40)).toBe('fix the rail width bug')
	})

	it('never exceeds the width it is given', () => {
		const long = entry('a'.repeat(200), 1)
		for (let width = 0; width <= 60; width += 1) {
			expect(stashLabel(long, width).length, `width ${width}`).toBeLessThanOrEqual(width)
		}
	})
})
