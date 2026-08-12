import { describe, expect, it } from 'vitest'

import {
	attentionMessage,
	notificationSequence,
	readFocusReport,
	shouldNotify,
	type FocusState,
} from '../../src/tui/Attention'

describe('shouldNotify', () => {
	/**
	 * Notifying someone who is looking at the screen is worse than not
	 * notifying: it teaches them to ignore the next one.
	 */
	it('stays quiet while the window has focus', () => {
		expect(shouldNotify('turn_done', 'focused')).toBe(false)
		expect(shouldNotify('permission', 'focused')).toBe(false)
		expect(shouldNotify('error', 'focused')).toBe(false)
	})

	it('notifies when the window is away', () => {
		expect(shouldNotify('turn_done', 'blurred')).toBe(true)
		expect(shouldNotify('permission', 'blurred')).toBe(true)
	})

	/** A missed notification is a worse failure than a redundant one. */
	it('notifies when the terminal never reported focus', () => {
		expect(shouldNotify('turn_done', 'unknown')).toBe(true)
	})

	/**
	 * A subagent finishing is progress, not a question: the root agent keeps
	 * working and nothing waits on the user. A parallel session would otherwise
	 * raise a dozen notifications nobody acted on.
	 */
	it('never notifies for a subagent, however the window is', () => {
		const states: ReadonlyArray<FocusState> = ['unknown', 'focused', 'blurred']
		for (const focus of states) {
			expect(shouldNotify('subagent_done', focus), `focus ${focus}`).toBe(false)
		}
	})
})

describe('readFocusReport', () => {
	it('reads the focus and blur reports', () => {
		expect(readFocusReport('\u001b[I')).toBe('focused')
		expect(readFocusReport('\u001b[O')).toBe('blurred')
	})

	it('says nothing about a chunk that carries no report', () => {
		expect(readFocusReport('hello')).toBe(null)
		expect(readFocusReport('\u001b[A')).toBe(null)
		expect(readFocusReport('')).toBe(null)
	})

	/** Tabbed away and back before the chunk was read: only the end matters. */
	it('takes the last report in a chunk', () => {
		expect(readFocusReport('\u001b[O\u001b[I')).toBe('focused')
		expect(readFocusReport('\u001b[I\u001b[O')).toBe('blurred')
	})

	it('finds a report surrounded by other input', () => {
		expect(readFocusReport('abc\u001b[Odef')).toBe('blurred')
	})
})

describe('attentionMessage', () => {
	it('says what happened, with the detail when there is one', () => {
		expect(attentionMessage('permission', 'bash rm -rf')).toBe('Waiting for approval: bash rm -rf')
		expect(attentionMessage('turn_done', '')).toBe('Ready')
	})
})

describe('notificationSequence', () => {
	it('wraps the title and body in OSC 777', () => {
		expect(notificationSequence('fold', 'Ready')).toBe('\u001b]777;notify;fold;Ready\u0007')
	})

	/**
	 * A stray BEL or ESC would end the sequence early and spill the rest of the
	 * message onto the screen as garbage.
	 */
	it('strips control characters that would end the sequence', () => {
		const sequence = notificationSequence('fold\u0007', 'body\u001bmore')
		expect(sequence.indexOf('\u0007')).toBe(sequence.length - 1)
		expect(sequence).not.toContain('\u001bm')
	})
})
