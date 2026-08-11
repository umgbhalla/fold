/** @jsxImportSource @opentui/solid */
import type { ScrollBoxRenderable } from '@opentui/core'
import { createEffect, Index } from 'solid-js'

import { renderRow } from './RowLayout'
import type { SkillView } from './Subagents'
import { theme } from './ThemeState'
import { tuiScrollbarOptions } from './TuiChrome'

/**
 * A skill's state as a word, and the glyph that stands in for it when the rail
 * is too narrow to spell it.
 *
 * The word and the name were separate `<text>` nodes with a flexible spacer
 * between them, which let them collide once the rail narrowed:
 * `▸ effect-prograAVAILAB`. The glyph already carries the state, so the word is
 * the part that goes.
 */
const stateWord = (skill: SkillView): string => (skill.used ? 'USED' : skill.loaded ? 'LOADED' : 'AVAILABLE')
const stateGlyph = (skill: SkillView): string => (skill.used ? '✦' : skill.loaded ? '◆' : '·')
const stateColor = (skill: SkillView): string =>
	skill.used ? theme.color.inject : skill.loaded ? theme.color.grid : theme.color.textDim

export const SkillsRail = (props: {
	readonly skills: ReadonlyArray<SkillView>
	readonly selected: number
	readonly active: boolean
	/** Inner width of the rail, in columns. */
	readonly width: number
	readonly onSelect: (index: number) => void
}) => {
	let scroller: ScrollBoxRenderable | undefined
	createEffect(() => {
		const skill = props.skills[props.selected]
		if (props.active && skill !== undefined) scroller?.scrollChildIntoView(`skill:${skill.name}`)
	})
	return (
		<scrollbox
			ref={(value: ScrollBoxRenderable) => (scroller = value)}
			flexGrow={1}
			scrollY
			scrollbarOptions={tuiScrollbarOptions()}
		>
			<box flexDirection="column" paddingX={1}>
				<box height={1} flexDirection="row">
					<text fg={theme.color.textFaint} wrapMode="none">{`${props.skills.length} AVAILABLE`}</text>
					<box flexGrow={1} />
					<text fg={theme.color.inject} wrapMode="none">
						✦ USED
					</text>
					<text fg={theme.color.grid} wrapMode="none">
						{' '}
						◆ LOADED
					</text>
				</box>
				<Index
					each={props.skills}
					fallback={<text fg={theme.color.textFaint}>NO SKILLS IN SESSION ROSTER</text>}
				>
					{(skill, index) => (
						<box
							id={`skill:${skill().name}`}
							flexDirection="column"
							flexShrink={0}
							border={['top']}
							borderColor={theme.chrome.border}
							backgroundColor={
								props.active && props.selected === index ? theme.color.raised : theme.color.panel
							}
							onMouseDown={() => props.onSelect(index)}
						>
							<text fg={stateColor(skill())} wrapMode="none">
								{renderRow(
									[
										{
											text: props.active && props.selected === index ? '▸' : stateGlyph(skill()),
											weight: 'required',
										},
										{ text: skill().name, weight: 'subject', minWidth: 8 },
										{ text: stateWord(skill()), weight: 'optional', priority: 0 },
									],
									Math.max(0, props.width - 2),
								)}
							</text>
							<text fg={theme.color.textFaint} wrapMode="none" truncate>
								{skill().description}
							</text>
						</box>
					)}
				</Index>
			</box>
		</scrollbox>
	)
}
