export type Pane = 'events' | 'context' | 'subagents'

export type NavigationLevel = 'pane' | 'input'

export type NavigationState = {
	readonly pane: Pane
	readonly level: NavigationLevel
	readonly selectedKey: string | null
}

export const initialNavigationState: NavigationState = {
	pane: 'events',
	level: 'pane',
	selectedKey: null,
}

export const selectedIndex = (keys: ReadonlyArray<string>, selectedKey: string | null): number => {
	if (keys.length === 0) return -1
	if (selectedKey === null) return keys.length - 1
	const index = keys.indexOf(selectedKey)
	return index === -1 ? keys.length - 1 : index
}

export const moveSelection = (state: NavigationState, keys: ReadonlyArray<string>, delta: -1 | 1): NavigationState => {
	if (keys.length === 0) return { ...state, selectedKey: null }
	const next = Math.max(0, Math.min(keys.length - 1, selectedIndex(keys, state.selectedKey) + delta))
	return { ...state, selectedKey: keys[next] ?? null }
}

export const jumpSelection = (
	state: NavigationState,
	keys: ReadonlyArray<string>,
	target: 'first' | 'last',
): NavigationState => ({
	...state,
	selectedKey: target === 'first' ? (keys[0] ?? null) : null,
})

export const reconcileSelection = (state: NavigationState, keys: ReadonlyArray<string>): NavigationState => {
	if (state.selectedKey === null || keys.includes(state.selectedKey)) return state
	return { ...state, selectedKey: null }
}

export const followLive = (state: NavigationState): NavigationState => ({ ...state, selectedKey: null })

/**
 * Move to the pane on the left or right, skipping panes that are not on screen.
 *
 * The cycle used to be hardcoded as events -> context -> subagents, which was
 * fine only while all three were always rendered. Now that the rail collapses
 * when it is empty or the terminal is narrow, a hardcoded cycle walks the user
 * into a pane that is not drawn: no border highlights, `j`/`k` move nothing, and
 * the way out is not visible anywhere.
 */
export const movePane = (
	state: NavigationState,
	direction: -1 | 1,
	available: ReadonlyArray<Pane>,
): NavigationState => {
	if (available.length === 0) return state
	const current = available.indexOf(state.pane)
	// A pane that vanished under the cursor lands the user at the near end rather
	// than wherever the missing index happened to fall.
	if (current === -1) return { ...state, pane: available[direction === 1 ? 0 : available.length - 1] ?? state.pane }
	const next = Math.max(0, Math.min(available.length - 1, current + direction))
	return { ...state, pane: available[next] ?? state.pane }
}

/**
 * Bring a pane selection back onto a pane that exists.
 *
 * Called when the rail collapses while it is the active pane, which happens on a
 * resize or when the last subagent finishes.
 */
export const reconcilePane = (state: NavigationState, available: ReadonlyArray<Pane>): NavigationState => {
	if (available.length === 0 || available.includes(state.pane)) return state
	return { ...state, pane: available[available.length - 1] ?? state.pane, level: 'pane' }
}

export const contextMode = (state: NavigationState, keys: ReadonlyArray<string>): 'live' | 'inspect' => {
	if (state.selectedKey === null || state.selectedKey === keys[keys.length - 1]) return 'live'
	return 'inspect'
}
