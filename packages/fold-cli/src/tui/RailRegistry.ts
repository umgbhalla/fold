import type { ModelConfiguration } from '@humanlayer/fold-agent'

import type { GitChange } from './GitChanges'
import type { RailSection } from './RailSections'
import type { SkillView, SubagentView } from './Subagents'

/**
 * The rail's sections, and what each one is worth showing right now.
 *
 * The rail used to be two tabs, which is a shape that only works while there
 * are two things: a tab bar spends a row of the pane whatever it holds, and
 * reading it costs the same whether you wanted the first tab or the fifth.
 * Sections are a list, so the rail can hold as many as the session has and let
 * {@link railSections} decide which ones are worth a name.
 *
 * `lastTouched` is an ordinal rather than a timestamp: the model only compares
 * them, and a counter cannot drift, go backwards across a clock change, or make
 * two sections visited in the same millisecond tie.
 */
export type RailSectionId = 'subagents' | 'skills' | 'changes' | 'models' | 'settings'

export type RailSectionInputs = {
	readonly agents: ReadonlyArray<SubagentView>
	readonly skills: ReadonlyArray<SkillView>
	readonly changes: ReadonlyArray<GitChange>
	readonly configuration: ModelConfiguration | undefined
	readonly touched: Readonly<Record<RailSectionId, number>>
}

/** Glyphs match the ones the events pane already uses for the same things. */
const icons: Readonly<Record<RailSectionId, string>> = {
	subagents: '★',
	skills: '✦',
	changes: '⎇',
	models: '◆',
	settings: '⚙',
}

const labels: Readonly<Record<RailSectionId, string>> = {
	subagents: 'SUBAGENTS',
	skills: 'SKILLS',
	changes: 'CHANGES',
	models: 'MODELS',
	settings: 'SETTINGS',
}

/**
 * Which sections the session has, with their counts and activity.
 *
 * A section with nothing in it is omitted rather than shown empty: a rail that
 * lists `CHANGES 0` in a clean worktree is spending rows to say nothing, and
 * the section reappears the moment there is something to see. Subagents and
 * settings are always present, because a session always has a root agent's
 * configuration and the roster is the rail's reason to exist.
 */
export const railSectionsFor = (inputs: RailSectionInputs): ReadonlyArray<RailSection<RailSectionId>> => {
	const sections: Array<RailSection<RailSectionId>> = []

	sections.push({
		id: 'subagents',
		label: labels.subagents,
		icon: icons.subagents,
		lastTouched: inputs.touched.subagents,
		...(inputs.agents.length > 0 ? { count: inputs.agents.length } : {}),
		// A running subagent is the clearest case for promoting a section you are
		// not looking at: it is the thing most likely to want your attention next.
		...(inputs.agents.some((agent) => agent.status === 'running') ? { active: true } : {}),
	})

	if (inputs.skills.length > 0)
		sections.push({
			id: 'skills',
			label: labels.skills,
			icon: icons.skills,
			lastTouched: inputs.touched.skills,
			count: inputs.skills.length,
		})

	if (inputs.changes.length > 0)
		sections.push({
			id: 'changes',
			label: labels.changes,
			icon: icons.changes,
			lastTouched: inputs.touched.changes,
			count: inputs.changes.length,
		})

	const providerCount = inputs.configuration?.providers.length ?? 0
	if (providerCount > 0)
		sections.push({
			id: 'models',
			label: labels.models,
			icon: icons.models,
			lastTouched: inputs.touched.models,
			count: providerCount,
		})

	sections.push({
		id: 'settings',
		label: labels.settings,
		icon: icons.settings,
		lastTouched: inputs.touched.settings,
	})

	return sections
}
