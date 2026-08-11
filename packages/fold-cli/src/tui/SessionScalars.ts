/**
 * The session's scalars, as one line for the header.
 *
 * These lived in a bordered STATUS panel inside the rail, where four key-value
 * pairs cost a quarter of the screen's width and every row of their own. They
 * are glanceable values, not something you navigate, and they changed rarely
 * enough during a live session that the panel was mostly still. The header
 * already renders session state and has room on its second line.
 */

/** A number of tokens, short enough for a header. */
export const compactTokens = (tokens: number): string => {
	if (tokens < 1_000) return String(tokens)
	if (tokens < 1_000_000) {
		const thousands = tokens / 1_000
		return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`
	}
	return `${(tokens / 1_000_000).toFixed(1)}m`
}

/**
 * A cost, rounded to where the digits still mean something.
 *
 * Four decimal places is right for a session that has spent a fraction of a
 * cent and absurd for one that has spent twelve dollars, so the precision
 * follows the magnitude.
 */
export const compactCost = (usd: number): string => {
	if (usd === 0) return '$0'
	if (usd < 0.01) return `$${usd.toFixed(4)}`
	if (usd < 1) return `$${usd.toFixed(3)}`
	return `$${usd.toFixed(2)}`
}

export type SessionScalars = {
	readonly contextTokens: number
	readonly contextPercent: number | null
	readonly costUsd: number | null
	readonly turns: number
	readonly agents: number
}

/**
 * Render the scalars, dropping whatever has nothing to say.
 *
 * A session with no pricing, no usage yet, and no subagents should render a
 * short line rather than a row of em dashes: an unknown is better left out than
 * spelled out, because a placeholder reads as a value at a glance.
 */
export const sessionScalarsLine = (scalars: SessionScalars): string => {
	const parts: Array<string> = []
	if (scalars.contextTokens > 0) {
		const window = scalars.contextPercent === null ? '' : ` (${scalars.contextPercent}%)`
		parts.push(`${compactTokens(scalars.contextTokens)} ctx${window}`)
	}
	if (scalars.costUsd !== null && scalars.costUsd > 0) parts.push(compactCost(scalars.costUsd))
	if (scalars.turns > 0) parts.push(`${scalars.turns} turn${scalars.turns === 1 ? '' : 's'}`)
	if (scalars.agents > 0) parts.push(`${scalars.agents} agent${scalars.agents === 1 ? '' : 's'}`)
	return parts.join(' · ')
}

/**
 * The glyph that stands for a tool in a tally.
 *
 * Matches the glyphs the events pane already uses for the same tools, so the
 * tally reads as a summary of the column beside it rather than a second
 * vocabulary to learn.
 */
export const toolGlyph = (name: string): string => {
	if (name === 'bash') return '⚙'
	if (name === 'read') return '▤'
	if (name === 'edit') return '✎'
	if (name === 'write') return '✚'
	if (name === 'subagent') return '★'
	if (name === 'skill') return '✦'
	return '◆'
}

/**
 * The tool tally, as one line: the glyph, its count, most used first.
 *
 * This replaces a panel of bars. A bar normalised against the series total is
 * honest but still spends thirty columns to say `subagent 14`, and the events
 * pane already lists every call individually, so the rail only needs the shape
 * of the session's work, not a chart of it.
 */
export const toolTallyLine = (
	toolCalls: ReadonlyArray<readonly [string, number]>,
	glyphFor: (name: string) => string,
	width: number,
): string => {
	if (toolCalls.length === 0) return ''
	const total = toolCalls.reduce((sum, [, count]) => sum + count, 0)
	const suffix = `${total}⚒`
	let line = ''
	for (const [name, count] of toolCalls) {
		const next = `${line}${line === '' ? '' : ' '}${glyphFor(name)}${count}`
		// Stop before the tally would collide with the total pinned to its right.
		if (next.length + 1 + suffix.length > width) break
		line = next
	}
	const gap = Math.max(1, width - line.length - suffix.length)
	return `${line}${' '.repeat(gap)}${suffix}`
}

/**
 * The fleet by agent type, as one line: `8 researcher · 7 general`.
 *
 * This is the one readout that had no home when META was retired. The counts
 * answer "what kind of work is this session doing", which the per-row list
 * cannot at a glance once the fleet is longer than the pane is tall.
 *
 * Types are abbreviated rather than dropped when the rail is narrow: a count
 * with no label says nothing, and the rail is 30 columns at its narrowest.
 * When even the abbreviations will not fit, the remainder collapses into
 * `+N`, so the total the user sees still adds up to the fleet.
 */
export const agentTypeLine = (agentTypes: ReadonlyArray<readonly [string, number]>, width: number): string => {
	if (agentTypes.length === 0 || width <= 0) return ''
	const shorten = (name: string): string => (name.length <= 10 ? name : `${name.slice(0, 9)}…`)
	let line = ''
	let shown = 0
	for (const [name, count] of agentTypes) {
		const next = `${line}${line === '' ? '' : ' · '}${count} ${shorten(name)}`
		const remaining = agentTypes.length - shown - 1
		// Leave room for the `+N` that will stand in for whatever does not fit.
		const reserve = remaining > 0 ? ` +${remaining}`.length : 0
		if (next.length + reserve > width) break
		line = next
		shown += 1
	}
	if (shown === 0) {
		// Not even one type fits; say how many there are rather than nothing.
		const total = agentTypes.reduce((sum, [, count]) => sum + count, 0)
		const fallback = `${total} agents`
		return fallback.length <= width ? fallback : ''
	}
	const hidden = agentTypes.length - shown
	return hidden > 0 ? `${line} +${hidden}` : line
}
