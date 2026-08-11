import {
	AgentId,
	MessageId,
	ToolCallId,
	type AgentFinishedLogEntry,
	type AssistantMessageLogEntry,
	type LogEntry,
	type ToolResultLogEntry,
} from '@humanlayer/fold-core'
import { describe, expect, it } from 'vitest'

import { expandedRowHeight, subagentActivity, toolCallSummaryLine } from '../../src/tui/SubagentActivity'
import type { SubagentStatus, SubagentView } from '../../src/tui/Subagents'

const agentId = AgentId.make('agent_aaaaaaaaaaaaaaaaaaaaaaaa')
const messageId = MessageId.make('msg_aaaaaaaaaaaaaaaaaaaaaaaa')
const callId = ToolCallId.make('tool_call_aaaaaaaaaaaaaaaaaaaaaaaa')
const otherCallId = ToolCallId.make('tool_call_bbbbbbbbbbbbbbbbbbbbbbbb')

const toolCall = (seq: number, id: ToolCallId, name: string, params: unknown): AssistantMessageLogEntry => ({
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
})

const toolResult = (seq: number, id: ToolCallId, name: string, result: unknown): ToolResultLogEntry => ({
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
})

const finished = (
	seq: number,
	outcome: AgentFinishedLogEntry['outcome'],
	resultText: string | null,
	reason: string | null,
): AgentFinishedLogEntry => ({
	_tag: 'agent-finished',
	seq,
	ts: seq * 1_000,
	agentId,
	parentAgentId: null,
	toolCallId: null,
	outcome,
	resultText,
	reason,
})

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

	/**
	 * A subagent emits no log entries for the whole duration of a tool call, so
	 * measuring silence from the newest entry counts a healthy three-minute test
	 * run as three minutes of being stuck. While a tool is out, the elapsed time
	 * belongs to the tool and there is no idleness to report.
	 */
	it('reports no idle time while a tool is still running', () => {
		const activity = subagentActivity(view([toolCall(5, callId, 'bash', { command: 'bun test' })]), 12_000)
		expect(activity.idleMs).toBeNull()
		expect(activity.runningToolMs).toBe(7_000)
		expect(activity.ageMs).toBe(12_000)
	})

	it('measures idle time from the newest entry once every tool has returned', () => {
		const activity = subagentActivity(
			view([toolCall(3, callId, 'bash', { command: 'bun test' }), toolResult(5, callId, 'bash', 'ok')]),
			12_000,
		)
		expect(activity.idleMs).toBe(7_000)
		expect(activity.runningToolMs).toBeNull()
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

describe('shapes taken from recorded sessions', () => {
	/**
	 * Real logs carry `''` rather than `null` for the field that does not apply,
	 * so a failed agent has `resultText: ''` alongside its reason and a completed
	 * one has `reason: ''`. Falling back on nullishness alone would render the
	 * empty string and the row would show a blank outcome line.
	 */
	it('reports a failed agent whose result text is empty rather than null', () => {
		const activity = subagentActivity(
			view([finished(3, 'error', '', 'OpenAiClient.createResponseStream: Invalid output: Missing key')], 'error'),
			10_000,
		)
		expect(activity.outcomeText).toBe('OpenAiClient.createResponseStream: Invalid output: Missing key')
	})

	it('reports a completed agent whose reason is empty rather than null', () => {
		const activity = subagentActivity(view([finished(3, 'completed', 'Exit status: 0', '')], 'done'), 10_000)
		expect(activity.outcomeText).toBe('Exit status: 0')
	})

	/** Results come back as markdown with fences and hard breaks. */
	it('flattens a multi-line markdown result onto one line', () => {
		const activity = subagentActivity(
			view([finished(3, 'completed', 'Exit status: `0`\n\n```text\nhi\n```', null)], 'done'),
			10_000,
		)
		expect(activity.outcomeText).toBe('Exit status: `0` ```text hi ```')
		expect(activity.outcomeText).not.toContain('\n')
	})

	it('has no outcome text when both fields are empty', () => {
		expect(subagentActivity(view([finished(3, 'completed', '', '')], 'done'), 10_000).outcomeText).toBeNull()
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
