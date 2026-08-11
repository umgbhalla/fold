import { AgentId, MessageId, ToolCallId, type LogEntry } from '@humanlayer/fold-core'
import { describe, expect, it } from 'vitest'

import { expandedRowHeight, subagentActivity, toolCallSummaryLine } from '../../src/tui/SubagentActivity'
import type { SubagentStatus, SubagentView } from '../../src/tui/Subagents'

const agentId = AgentId.make('agent_aaaaaaaaaaaaaaaaaaaaaaaa')
const messageId = MessageId.make('msg_aaaaaaaaaaaaaaaaaaaaaaaa')
const callId = ToolCallId.make('tool_call_aaaaaaaaaaaaaaaaaaaaaaaa')
const otherCallId = ToolCallId.make('tool_call_bbbbbbbbbbbbbbbbbbbbbbbb')

const toolCall = (seq: number, id: ToolCallId, name: string, params: unknown): LogEntry =>
	({
		_tag: 'assistant-message',
		seq,
		ts: seq * 1_000,
		agentId,
		parentAgentId: null,
		toolCallId: null,
		messageId,
		message: {
			role: 'assistant',
			content: [{ type: 'tool-call', id, name, params, providerExecuted: false }],
		},
		finish: null,
	}) as unknown as LogEntry

const toolResult = (seq: number, id: ToolCallId, name: string, result: unknown): LogEntry =>
	({
		_tag: 'tool-result',
		seq,
		ts: seq * 1_000,
		agentId,
		parentAgentId: null,
		toolCallId: id,
		messageId,
		message: {
			role: 'tool',
			content: [{ type: 'tool-result', id, name, result, isFailure: false }],
		},
	}) as unknown as LogEntry

const finished = (seq: number, outcome: string, resultText: string | null, reason: string | null): LogEntry =>
	({
		_tag: 'agent-finished',
		seq,
		ts: seq * 1_000,
		agentId,
		parentAgentId: null,
		toolCallId: null,
		outcome,
		resultText,
		reason,
	}) as unknown as LogEntry

const view = (entries: ReadonlyArray<LogEntry>, status: SubagentStatus = 'running'): SubagentView => ({
	agentId,
	calledAt: 0,
	type: 'researcher',
	description: 'Inspect the rail',
	prompt: 'Inspect the rail',
	status,
	turns: entries.filter((entry) => entry._tag === 'assistant-message').length,
	tools: 0,
	entries,
})

describe('toolCallSummaryLine', () => {
	it('prefers a command', () => {
		expect(toolCallSummaryLine({ command: 'bun run test', path: 'x' })).toBe('bun run test')
	})

	it('falls back through path, description, then prompt', () => {
		expect(toolCallSummaryLine({ path: 'src/tui/App.tsx' })).toBe('src/tui/App.tsx')
		expect(toolCallSummaryLine({ description: 'find the bug' })).toBe('find the bug')
		expect(toolCallSummaryLine({ prompt: 'go look' })).toBe('go look')
	})

	it('flattens newlines so a rail row stays one line', () => {
		expect(toolCallSummaryLine({ command: 'set -e\nbun test\n' })).toBe('set -e bun test')
	})

	it('shows an unknown tool as its params rather than nothing', () => {
		expect(toolCallSummaryLine({ pattern: 'foo' })).toBe('{"pattern":"foo"}')
	})
})

describe('subagentActivity', () => {
	it('reports the tool that has no result yet as running', () => {
		const activity = subagentActivity(view([toolCall(1, callId, 'bash', { command: 'bun test' })]), 10_000)
		expect(activity.runningTool).toEqual({ name: 'bash', summary: 'bun test' })
	})

	/**
	 * The distinction the rail exists to make: an agent that finished its last
	 * tool is not running it, and rendering the command as if it were live is
	 * worse than rendering nothing.
	 */
	it('reports no running tool once every call has a result', () => {
		const activity = subagentActivity(
			view([toolCall(1, callId, 'bash', { command: 'bun test' }), toolResult(2, callId, 'bash', '42 pass')]),
			10_000,
		)
		expect(activity.runningTool).toBeNull()
	})

	it('picks the unresolved call even when a later call resolved', () => {
		const activity = subagentActivity(
			view([
				toolCall(1, callId, 'bash', { command: 'sleep 60' }),
				toolCall(2, otherCallId, 'read', { path: 'a.ts' }),
				toolResult(3, otherCallId, 'read', 'contents'),
			]),
			10_000,
		)
		expect(activity.runningTool?.name).toBe('bash')
	})

	it('never reports a running tool for a finished agent', () => {
		const activity = subagentActivity(view([toolCall(1, callId, 'bash', { command: 'bun test' })], 'done'), 10_000)
		expect(activity.runningTool).toBeNull()
	})

	it('measures idle time from the newest entry, not from dispatch', () => {
		const activity = subagentActivity(view([toolCall(5, callId, 'bash', { command: 'x' })]), 12_000)
		expect(activity.ageMs).toBe(12_000)
		expect(activity.idleMs).toBe(7_000)
	})

	it('has no idle time when the agent has no entries', () => {
		expect(subagentActivity(view([]), 5_000).idleMs).toBeNull()
	})

	it('takes the newest tool output as the last output', () => {
		const activity = subagentActivity(
			view([
				toolCall(1, callId, 'bash', { command: 'a' }),
				toolResult(2, callId, 'bash', 'first'),
				toolCall(3, otherCallId, 'bash', { command: 'b' }),
				toolResult(4, otherCallId, 'bash', 'second'),
			]),
			10_000,
		)
		expect(activity.lastOutput).toBe('second')
	})

	it('reads a structured result through its output field', () => {
		const activity = subagentActivity(
			view([toolCall(1, callId, 'bash', { command: 'a' }), toolResult(2, callId, 'bash', { output: '42 pass' })]),
			10_000,
		)
		expect(activity.lastOutput).toBe('42 pass')
	})

	it('reports a completed agent by its result text', () => {
		const activity = subagentActivity(view([finished(3, 'completed', 'Found the race', null)], 'done'), 10_000)
		expect(activity.outcomeText).toBe('Found the race')
	})

	it('reports a failed agent by its reason', () => {
		const activity = subagentActivity(
			view([finished(3, 'error', 'partial output', 'malformed id')], 'error'),
			10_000,
		)
		expect(activity.outcomeText).toBe('malformed id')
	})

	it('has no outcome text while the agent is still running', () => {
		expect(subagentActivity(view([toolCall(1, callId, 'bash', { command: 'x' })]), 10_000).outcomeText).toBeNull()
	})
})

describe('expandedRowHeight', () => {
	it('reserves two lines when there is nothing to detail', () => {
		expect(expandedRowHeight(subagentActivity(view([]), 1_000))).toBe(2)
	})

	it('reserves a line for a running tool and a line for its output', () => {
		const activity = subagentActivity(
			view([
				toolCall(1, callId, 'bash', { command: 'a' }),
				toolResult(2, callId, 'bash', 'done'),
				toolCall(3, otherCallId, 'bash', { command: 'b' }),
			]),
			10_000,
		)
		expect(expandedRowHeight(activity)).toBe(4)
	})

	it('stays within four lines for every state', () => {
		const states = [
			view([toolCall(1, callId, 'bash', { command: 'a' })]),
			view([finished(2, 'completed', 'ok', null)], 'done'),
			view([finished(2, 'error', null, 'boom')], 'error'),
			view([]),
		]
		for (const state of states) {
			expect(expandedRowHeight(subagentActivity(state, 10_000))).toBeLessThanOrEqual(4)
		}
	})
})
