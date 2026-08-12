import { AgentId } from '@humanlayer/fold-core'
import { describe, expect, it } from 'vitest'

import type { GitChange } from '../../src/tui/GitChanges'
import { railSectionsFor, type RailSectionId } from '../../src/tui/RailRegistry'
import type { SkillView, SubagentView } from '../../src/tui/Subagents'

const touched: Record<RailSectionId, number> = {
	subagents: 5,
	skills: 4,
	changes: 3,
	models: 2,
	settings: 1,
}

const agent = (status: SubagentView['status']): SubagentView => ({
	agentId: AgentId.make('agent_aaaaaaaaaaaaaaaaaaaaaaaa'),
	calledAt: 0,
	type: 'researcher',
	description: 'work',
	prompt: '',
	status,
	turns: 1,
	tools: 0,
	entries: [],
})

const change: GitChange = {
	key: 'unstaged:a.ts',
	group: 'unstaged',
	status: 'M',
	path: 'a.ts',
	additions: 1,
	deletions: 0,
	diff: '',
	expandedDiff: '',
	patchHash: 'h',
}

const skill: SkillView = { name: 'diagnosing-bugs', description: 'find bugs', loaded: true, used: false }

const base = { agents: [], skills: [], changes: [], configuration: undefined, touched }

describe('railSectionsFor', () => {
	/** An empty section is rows spent to say nothing. */
	it('omits sections the session has nothing for', () => {
		expect(railSectionsFor(base).map((section) => section.id)).toEqual(['subagents', 'settings'])
	})

	it('adds sections as the session acquires them', () => {
		const full = railSectionsFor({
			...base,
			agents: [agent('done')],
			skills: [skill],
			changes: [change],
			configuration: {
				profiles: [],
				providers: [
					{
						name: 'anthropic',
						kind: 'anthropic',
						apiKeyEnv: null,
						credentialPresent: true,
						models: [],
					},
				],
			},
		})
		expect(full.map((section) => section.id)).toEqual(['subagents', 'skills', 'changes', 'models', 'settings'])
	})

	it('carries counts so a collapsed section still reports what is in it', () => {
		const sections = railSectionsFor({ ...base, agents: [agent('done'), agent('done')], changes: [change] })
		expect(sections.find((section) => section.id === 'subagents')?.count).toBe(2)
		expect(sections.find((section) => section.id === 'changes')?.count).toBe(1)
	})

	/** The case the whole promotion rule exists for. */
	it('marks subagents active while one is running', () => {
		expect(railSectionsFor({ ...base, agents: [agent('running')] })[0]?.active).toBe(true)
		expect(railSectionsFor({ ...base, agents: [agent('done')] })[0]?.active).toBeUndefined()
	})

	it('passes the touch ordinals through for the recency sort', () => {
		const sections = railSectionsFor({ ...base, skills: [skill] })
		expect(sections.find((section) => section.id === 'skills')?.lastTouched).toBe(4)
	})

	it('never reports a zero count', () => {
		const sections = railSectionsFor(base)
		expect(sections.every((section) => section.count === undefined || section.count > 0)).toBe(true)
	})
})
