import { AgentId, MessageId, type AssistantMessageLogEntry, type LogEntry } from '@humanlayer/fold-core'
import { describe, expect, it } from 'vitest'

import { renderRow } from '../../src/tui/RowLayout'
import { subagentActivity } from '../../src/tui/SubagentActivity'
import { collapsedRowCells, expandedStatsLine } from '../../src/tui/SubagentRowText'
import type { SubagentStatus, SubagentView } from '../../src/tui/Subagents'

const agentId = AgentId.make('agent_aaaaaaaaaaaaaaaaaaaaaaaa')
const NOW = 1_000_000
const emptyEntries: ReadonlyArray<LogEntry> = []

const view = (overrides: Partial<SubagentView> & { readonly status?: SubagentStatus } = {}): SubagentView => ({
	agentId,
	calledAt: NOW - 4 * 60_000,
	type: 'researcher',
	description: 'Inspect the rail',
	prompt: 'Inspect the rail',
	status: 'running',
	turns: 3,
	tools: 12,
	entries: emptyEntries,
	...overrides,
})

const collapsed = (agent: SubagentView, width: number): string => renderRow(collapsedRowCells(agent, NOW), width)

describe('collapsedRowCells', () => {
	it('leads with a glyph, not a status word', () => {
		const line = collapsed(view(), 40)
		expect(line.startsWith('◐')).toBe(true)
		expect(line).not.toContain('RUNNING')
	})

	it('gives each status its own glyph', () => {
		const glyphs = (['running', 'done', 'error', 'interrupted', 'stopped'] as const).map((status) =>
			collapsed(view({ status }), 40).charAt(0),
		)
		expect(new Set(glyphs).size).toBe(glyphs.length)
	})

	/** The bug the rail existed to fix: fifteen agents rendering identically. */
	it('keeps the description at the width that used to erase it', () => {
		const line = collapsed(view({ description: 'Overflow task 12' }), 26)
		expect(line).toContain('Overf')
		expect(line).toContain('12')
	})

	it('distinguishes descriptions that differ only in their tail', () => {
		const one = collapsed(view({ description: 'Overflow task 1' }), 26)
		const twelve = collapsed(view({ description: 'Overflow task 12' }), 26)
		expect(one).not.toBe(twelve)
	})

	it('abbreviates a multi-word agent type to its initials', () => {
		expect(collapsed(view({ type: 'general-purpose' }), 40)).toContain('gp')
	})

	it('never exceeds the width it was given', () => {
		for (const width of [12, 18, 24, 28, 34, 42]) {
			const line = collapsed(view({ description: 'Overflow task 12', type: 'general-purpose' }), width)
			expect(line.length, `width ${width}: ${line}`).toBeLessThanOrEqual(width)
		}
	})
})

describe('expandedStatsLine', () => {
	const stats = (agent: SubagentView, width = 40): string =>
		expandedStatsLine(subagentActivity(agent, NOW), agent.type, width)

	it('reports work done', () => {
		const line = stats(view())
		expect(line).toContain('3t')
		expect(line).toContain('12⚒')
	})

	/**
	 * The distinction that makes the line worth reading: an agent whose tool is
	 * still out is working, and one that has gone quiet with nothing running is
	 * the one worth looking at. An agent with no entries at all has not been
	 * silent for a measurable time, so it reports its age instead of claiming an
	 * idleness it cannot know.
	 */
	it('reports age, not idleness, for an agent that has produced nothing yet', () => {
		const line = stats(view())
		expect(line).toContain('4m')
		expect(line).not.toContain('idle')
	})

	it('reports a quiet agent as idle once it has produced something', () => {
		const entry: AssistantMessageLogEntry = {
			_tag: 'assistant-message',
			seq: 1,
			ts: NOW - 3 * 60_000,
			agentId,
			parentAgentId: null,
			toolCallId: null,
			messageId: MessageId.make('msg_aaaaaaaaaaaaaaaaaaaaaaaa'),
			message: { role: 'assistant', content: 'done thinking' },
			finish: null,
		}
		expect(stats(view({ entries: [entry] }))).toContain('idle 3m')
	})

	it('does not call a finished agent idle', () => {
		expect(stats(view({ status: 'done' }))).not.toContain('idle')
	})

	it('never exceeds the width it was given', () => {
		for (const width of [12, 20, 26, 34, 42]) {
			expect(stats(view({ type: 'general-purpose' }), width).length, `width ${width}`).toBeLessThanOrEqual(width)
		}
	})

	/** At the narrowest widths the timing is what survives, not the counters. */
	it('keeps the timing when the counters no longer fit', () => {
		expect(stats(view(), 12)).toMatch(/idle|4m/)
	})
})
