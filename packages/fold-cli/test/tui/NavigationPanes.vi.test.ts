import { describe, expect, it } from 'vitest'

import {
	contextMode,
	initialNavigationState,
	movePane,
	reconcilePane,
	type NavigationState,
	type Pane,
} from '../../src/tui/Navigation'

const allPanes: ReadonlyArray<Pane> = ['events', 'context', 'subagents']
const withoutRail: ReadonlyArray<Pane> = ['events', 'context']
const at = (pane: Pane): NavigationState => ({ ...initialNavigationState, pane })

describe('movePane', () => {
	it('walks right through every pane that is on screen', () => {
		expect(movePane(at('events'), 1, allPanes).pane).toBe('context')
		expect(movePane(at('context'), 1, allPanes).pane).toBe('subagents')
	})

	it('walks left again', () => {
		expect(movePane(at('subagents'), -1, allPanes).pane).toBe('context')
		expect(movePane(at('context'), -1, allPanes).pane).toBe('events')
	})

	it('stops at the ends rather than wrapping', () => {
		expect(movePane(at('events'), -1, allPanes).pane).toBe('events')
		expect(movePane(at('subagents'), 1, allPanes).pane).toBe('subagents')
	})

	/**
	 * The bug this exists to prevent: with the rail collapsed, two presses of `l`
	 * used to land on `subagents`, a pane that is not drawn. No border highlighted,
	 * `j`/`k` moved nothing, and nothing on screen said where the cursor had gone.
	 */
	it('cannot reach the rail while it is collapsed', () => {
		const afterOne = movePane(at('events'), 1, withoutRail)
		const afterTwo = movePane(afterOne, 1, withoutRail)
		expect(afterOne.pane).toBe('context')
		expect(afterTwo.pane).toBe('context')
	})

	it('leaves the state alone when no pane is on screen', () => {
		expect(movePane(at('events'), 1, []).pane).toBe('events')
	})
})

describe('reconcilePane', () => {
	it('leaves a pane that is still on screen alone', () => {
		expect(reconcilePane(at('context'), allPanes)).toEqual(at('context'))
	})

	/** The rail collapsing while focused, on a resize or when the last agent ends. */
	it('moves off a pane that has gone away', () => {
		const settled = reconcilePane({ ...at('subagents'), level: 'input' }, withoutRail)
		expect(settled.pane).toBe('context')
		expect(settled.level).toBe('pane')
	})

	it('keeps the selected row while moving pane', () => {
		const settled = reconcilePane({ ...at('subagents'), selectedKey: 'row-7' }, withoutRail)
		expect(settled.selectedKey).toBe('row-7')
	})
})

describe('contextMode', () => {
	it('follows live when nothing is selected', () => {
		expect(contextMode(at('events'), ['a', 'b'])).toBe('live')
	})

	it('inspects a row that is not the newest', () => {
		expect(contextMode({ ...at('events'), selectedKey: 'a' }, ['a', 'b'])).toBe('inspect')
	})

	it('treats the newest row as live', () => {
		expect(contextMode({ ...at('events'), selectedKey: 'b' }, ['a', 'b'])).toBe('live')
	})
})
