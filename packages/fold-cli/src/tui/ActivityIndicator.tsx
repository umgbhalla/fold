/** @jsxImportSource @opentui/solid */
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'

import { theme } from './ThemeState'

export type ActivityState = 'ready' | 'running' | 'compacting' | 'stopped' | 'error'

const presentation = (state: ActivityState, frame: number): { readonly glyph: string; readonly color: string } => {
	switch (state) {
		case 'ready':
			return { glyph: '◆', color: theme.color.grid }
		case 'running':
			return {
				glyph: ['◐', '◓', '◑', '◒'][frame % 4] ?? '◐',
				color: frame % 2 === 0 ? theme.color.coreBright : theme.color.core,
			}
		case 'compacting':
			return {
				glyph: frame % 2 === 0 ? '◇' : '◆',
				color: frame % 2 === 0 ? theme.color.inject : theme.color.coreBright,
			}
		case 'stopped':
			return { glyph: '■', color: theme.color.textDim }
		case 'error':
			return { glyph: '✕', color: theme.color.alert }
	}
}

export const ActivityIndicator = (props: {
	readonly state: ActivityState
	readonly label?: string
	readonly width?: number
}) => {
	const [frame, setFrame] = createSignal(0)
	// The timer is armed only while there is motion to show. An idle session used
	// to wake the renderer ~5.5 times a second for a glyph that never changed.
	const animating = createMemo(() => props.state === 'running' || props.state === 'compacting')
	createEffect(() => {
		if (!animating()) return
		const timer = setInterval(() => setFrame((current) => current + 1), 180)
		onCleanup(() => clearInterval(timer))
	})

	return (
		<text
			fg={presentation(props.state, frame()).color}
			{...(props.width === undefined ? {} : { width: props.width })}
			wrapMode="none"
		>
			{`${presentation(props.state, frame()).glyph} ${props.label ?? props.state.toUpperCase()}`}
		</text>
	)
}
