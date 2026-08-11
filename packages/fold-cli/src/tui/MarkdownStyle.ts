import { tactical } from '@humanlayer/fold-tui-theme/tactical'
import { SyntaxStyle, TreeSitterClient, type MarkdownTableOptions } from '@opentui/core'

export type MarkdownTone = 'normal' | 'muted'

class MarkdownTreeSitterClient extends TreeSitterClient {
	constructor() {
		super({ dataPath: '' }, { autoStartWorker: false })
	}

	override highlightOnce(_content: string, _filetype: string): Promise<{ highlights: [] }> {
		// Streaming Markdown already supplies StyledText; avoid starting a worker just to restyle those same blocks.
		return Promise.resolve({ highlights: [] })
	}
}

export const markdownTreeSitterClient = new MarkdownTreeSitterClient()

export const markdownStyleDefinitions = (tone: MarkdownTone) => {
	const muted = tone === 'muted'
	const text = muted ? tactical.color.textDim : tactical.color.text
	const textDim = muted ? tactical.color.textFaint : tactical.color.textDim
	const accent = muted ? tactical.color.gridDim : tactical.color.grid
	const bright = muted ? tactical.color.coreDim : tactical.color.coreBright

	// Markdown roles follow opencode's default theme: heading -> accent(purple),
	// link -> primary(sand), strong -> orange(sand core), emphasis/quote -> yellow
	// (gold), list markers -> cyan(grid). fold's palette carries no dedicated green
	// slot, so fenced/inline code keeps opencode's cool "code" tone via `grid`
	// (cyan). Every colour used here clears the 7:1 contrast floor on the void, and
	// the code background pair (grid on raised) clears 8.4:1.
	const heading = muted ? tactical.color.coreDim : tactical.color.inject
	const emphasis = muted ? tactical.color.textDim : tactical.color.coreDim
	const strong = muted ? tactical.color.coreDim : tactical.color.core

	return {
		keyword: { fg: bright, bold: true },
		string: { fg: accent },
		comment: { fg: textDim, italic: true },
		number: { fg: tactical.color.inject },
		function: { fg: tactical.color.core },
		type: { fg: accent },
		operator: { fg: bright },
		variable: { fg: text },
		property: { fg: accent },
		'punctuation.bracket': { fg: textDim },
		'punctuation.delimiter': { fg: textDim },
		'markup.heading': { fg: heading, bold: true },
		'markup.heading.1': { fg: heading, bold: true },
		'markup.heading.2': { fg: tactical.color.core, bold: true },
		'markup.heading.3': { fg: accent, bold: true },
		'markup.bold': { fg: strong, bold: true },
		'markup.strong': { fg: strong, bold: true },
		'markup.italic': { fg: emphasis, italic: true },
		'markup.list': { fg: accent },
		'markup.quote': { fg: emphasis, italic: true },
		'markup.raw': { fg: accent, bg: tactical.color.raised },
		'markup.raw.block': { fg: accent, bg: tactical.color.raised },
		'markup.raw.inline': { fg: accent, bg: tactical.color.raised },
		'markup.link': { fg: tactical.color.core, underline: true },
		'markup.link.label': { fg: tactical.color.core, underline: true },
		'markup.link.url': { fg: tactical.color.gridDim, underline: true },
		'diff.plus': { fg: tactical.color.grid },
		'diff.minus': { fg: tactical.color.alert },
		label: { fg: tactical.color.core },
		conceal: { fg: tactical.color.textFaint },
		default: { fg: text, dim: muted },
	}
}

const syntaxStyleCache = new Map<MarkdownTone, SyntaxStyle>()

export const markdownSyntaxStyle = (tone: MarkdownTone): SyntaxStyle => {
	const cached = syntaxStyleCache.get(tone)
	if (cached !== undefined) return cached

	const syntaxStyle = SyntaxStyle.fromStyles(markdownStyleDefinitions(tone))
	syntaxStyleCache.set(tone, syntaxStyle)
	return syntaxStyle
}

export const markdownTableOptions = {
	style: 'grid',
	widthMode: 'full',
	columnFitter: 'balanced',
	wrapMode: 'word',
	cellPaddingX: 1,
	borderStyle: tactical.chrome.panelStyle,
	borderColor: tactical.chrome.border,
} as const satisfies MarkdownTableOptions
