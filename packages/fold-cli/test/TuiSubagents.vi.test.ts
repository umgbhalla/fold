import { AgentId, StateId, type AgentStartedLogEntry, type LogEntry, MessageId } from '@humanlayer/fold-core'
import { describe, expect, it } from 'vitest'

import { relativeSubagentTime, skillViews, subagentViews } from '../src/tui/Subagents'

const startedEntry = (agentId: string, seq: number, ts: number): AgentStartedLogEntry => ({
	_tag: 'agent_started',
	seq,
	ts,
	agentId: AgentId.make(agentId),
	parentAgentId: AgentId.make('agent_aaaaaaaaaaaaaaaaaaaaaaaa'),
	toolCallId: null,
	mode: 'fresh',
	model: {
		providerId: 'anthropic',
		providerKind: 'anthropic',
		modelId: 'fixture-model',
		role: null,
		requestedReasoningLevel: 'off',
		thinking: { _tag: 'disabled' },
	},
	tools: [],
	skill: null,
	fork: null,
	agentType: 'researcher',
})

describe('subagentViews', () => {
	it('sorts subagents in call order and retains their call time', () => {
		const rootAgentId = AgentId.make('agent_aaaaaaaaaaaaaaaaaaaaaaaa')
		const later = startedEntry('agent_cccccccccccccccccccccccc', 20, 2_000)
		const earlier = startedEntry('agent_bbbbbbbbbbbbbbbbbbbbbbbb', 10, 1_000)

		const views = subagentViews([later, earlier], rootAgentId)

		expect(views.map((view) => view.agentId)).toEqual([earlier.agentId, later.agentId])
		expect(views.map((view) => view.calledAt)).toEqual([1_000, 2_000])
	})
})

describe('subagentViews cost', () => {
	/**
	 * One `agent_started` per agent, then ordinary traffic attributed to it. The
	 * traffic is what the projection used to rescan once per agent.
	 */
	const logWith = (agents: number, perAgent: number): ReadonlyArray<LogEntry> => {
		const entries: Array<LogEntry> = []
		let seq = 0
		for (let a = 0; a < agents; a += 1) {
			const agentId = AgentId.make(`agent_${String(a).padStart(24, 'a')}`)
			entries.push(startedEntry(agentId, seq, seq))
			seq += 1
			for (let n = 0; n < perAgent; n += 1) {
				const traffic: LogEntry = {
					_tag: 'tool_state',
					seq,
					ts: seq,
					agentId,
					parentAgentId: null,
					toolCallId: null,
					namespace: 'bench',
					stateId: StateId.make(`state_${String(seq).padStart(24, 'a')}`),
					key: 'k',
					value: seq,
				}
				entries.push(traffic)
				seq += 1
			}
		}
		return entries
	}

	/**
	 * The projection filtered the whole log once per agent, so a session where
	 * both the log and the fleet grow paid for it twice over: 3.8 ms per rebuild
	 * at 7320 entries against 0.13 ms at 330, which is what made live rendering
	 * choppy.
	 *
	 * Counting entry visits rather than timing it: a wall-clock ratio is noisy
	 * enough on a loaded machine that the quadratic version still passed a
	 * generous bound, so the check has to be structural to mean anything. With
	 * grouping, each entry is visited a fixed number of times whatever the fleet
	 * size; without it, visits scale with the number of agents.
	 */
	it('visits each entry a bounded number of times, whatever the fleet size', () => {
		const root = AgentId.make('agent_rrrrrrrrrrrrrrrrrrrrrrrr')
		const visitsFor = (agents: number): number => {
			const entries = logWith(agents, 10)
			let visits = 0
			const counted: ReadonlyArray<LogEntry> = entries.map((entry) => {
				const proxy: LogEntry = { ...entry }
				Object.defineProperty(proxy, 'agentId', {
					get: () => {
						visits += 1
						return entry.agentId
					},
				})
				return proxy
			})
			subagentViews(counted, root)
			return visits / entries.length
		}

		const few = visitsFor(2)
		const many = visitsFor(40)
		// Twenty times the agents must not mean twenty times the visits per entry.
		expect(many / few, `visits per entry went ${few.toFixed(1)} -> ${many.toFixed(1)}`).toBeLessThan(2)
	})
})

describe('relativeSubagentTime', () => {
	const now = 2_000_000_000_000

	it.each([
		[0, 'now'],
		[1 * 60_000, '1m'],
		[59 * 60_000, '59m'],
		[60 * 60_000, '1h'],
		[23 * 60 * 60_000, '23h'],
		[24 * 60 * 60_000, '1d'],
		[29 * 24 * 60 * 60_000, '29d'],
		[30 * 24 * 60 * 60_000, '1mo'],
		[365 * 24 * 60 * 60_000, '1y'],
	])('formats an age of %i milliseconds as %s', (age, expected) => {
		expect(relativeSubagentTime(now - age, now)).toBe(expected)
	})
})

describe('skillViews', () => {
	it('sorts skills alphabetically by name', () => {
		const agentId = AgentId.make('agent_aaaaaaaaaaaaaaaaaaaaaaaa')
		const entries: ReadonlyArray<LogEntry> = [
			{
				_tag: 'system-message',
				seq: 1,
				ts: 1,
				agentId,
				parentAgentId: null,
				toolCallId: null,
				messageId: MessageId.make('msg_aaaaaaaaaaaaaaaaaaaaaaaa'),
				placement: 'leading',
				messages: [
					{
						role: 'system',
						content:
							'<available_skills><skill><name>zebra</name><description>Last</description></skill><skill><name>Alpha</name><description>First</description></skill><skill><name>middle</name><description>Middle</description></skill></available_skills>',
					},
				],
			},
		]

		expect(skillViews(entries, agentId).map((skill) => skill.name)).toEqual(['Alpha', 'middle', 'zebra'])
	})
})
