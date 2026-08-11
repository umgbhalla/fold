import type { Theme } from './types'

/**
 * HIGH CONTRAST — the single, shipped Fold theme.
 *
 * Built on the geometry of opencode's default dark theme: a near-black neutral
 * ramp (background / panel / element / borders / muted / text) with hues used
 * only to carry meaning, and opencode's warm-sand brand primary kept intact so
 * Fold reads as a sibling of opencode rather than a repaint. The exact
 * background (#0a0a0a), panel (#141414), element/raised (#1e1e1e), body text
 * (#eeeeee) and primary (#fab283 / #ffc09f) come straight from
 * opencode.json.
 *
 * Where it DIVERGES from opencode: the muted and border tiers are lifted well
 * past opencode's own numbers, whose textMuted (5.0:1, and 4.2:1 on the element
 * background) is exactly the unreadability complaint this theme exists to fix.
 * Every foreground tier and every accent used for text is measured against the
 * void with WCAG 2.1 relative luminance and held above a fixed floor (see
 * README.md / STYLE.md):
 *
 *   text     >= 13:1   textDim  >= 8:1 on void AND >= 7:1 on raised
 *   textFaint >= 5.5:1
 *   accents used as foreground (core, coreBright, coreDim, grid, gridDim, inject,
 *     alert, semantic.*) >= 7:1
 *   borders / chrome >= 4.5:1
 *
 * Hues stay distinguishable for deuteranopia/protanopia: meaning is never carried
 * by red-vs-green alone — state is paired with a glyph and/or weight (see
 * ActivityIndicator). The dim tier, which carries most labels, borders, footers
 * and secondary text, is the whole point: it is legible, not a whisper.
 *
 * The CRT post-fx passes (glow, scanlines, vignette, rolling bar, glitch) still
 * exist in the code but ship permanently OFF; the `fx` shape below keeps
 * `hud/postfx.ts` compiling and lets an embedder opt back in.
 */
const palette = {
	// opencode's neutral ramp, exact: background / panel / element(raised).
	void: '#0a0a0a',
	panel: '#141414',
	raised: '#1e1e1e',

	// THE FOUNDATION — opencode's warm-sand primary (#fab283 / #ffc09f), kept
	// verbatim; `gold` is a lifted dim sand for the muted structural tone.
	sand: '#fab283',
	sandBright: '#ffc09f',
	gold: '#e0a860',

	// AUGMENTATION — cool relief for structural data (ids, refs, code, in-text
	// borders). opencode's cyan role, lifted to clear 7:1.
	cyan: '#68c6d2',
	cyanDim: '#56b6c2',

	// AUGMENTATION — "injected" values (cross-references, highlighted figures).
	// opencode's purple accent, lifted from 5.9:1 to clear 7:1 and stay separable
	// from sand and cyan under CVD.
	violet: '#bda6f0',

	// CRITICAL — failures and destructive actions. opencode's red, lifted from
	// 6.2:1 to clear 7:1, always paired with a glyph so it never signals by hue alone.
	red: '#ef8a94',

	// Text hierarchy — opencode's #eeeeee body, then muted/faint tiers lifted far
	// past opencode's own 5.0:1 textMuted so labels and footers stay readable.
	ink: '#eeeeee',
	inkDim: '#b6b2ab',
	inkFaint: '#949089',

	// Chrome — opencode's borders were 1.8–3.1:1; raised to a visible-but-quiet 5.1:1.
	border: '#828282',

	// Used by nothing but the (off-by-default) glitch corrupt palette.
	gray: '#6B645A',
	grayDim: '#403A32',
} as const

export const tactical: Theme = {
	name: 'HIGH CONTRAST',
	tagline: 'READABLE // NOMINAL',

	color: {
		void: palette.void,
		panel: palette.panel,
		raised: palette.raised,

		core: palette.sand,
		coreBright: palette.sandBright,
		coreDim: palette.gold,

		grid: palette.cyan,
		gridDim: palette.cyanDim,

		inject: palette.violet,

		alert: palette.red,

		text: palette.ink,
		textDim: palette.inkDim,
		textFaint: palette.inkFaint,
	},

	chrome: {
		frameStyle: 'heavy',
		panelStyle: 'single',
		border: palette.border,
		title: palette.sand,
		heading: '[ ',
	},

	semantic: {
		// Sand = active, red = terminated/critical, cyan = merged, dim = inactive.
		// The row's glyph carries the state so sand-vs-red never stands alone.
		open: palette.sand,
		closed: palette.red,
		merged: palette.cyan,
		draft: palette.inkDim,
	},

	fx: {
		// Post-fx ship OFF (the FxToggles default in the app disables every pass).
		// The shapes below stay so hud/postfx.ts compiles and an embedder can opt in.
		glow: { threshold: 0.6, strength: 0.07, radius: 2 },
		scanlines: { strength: 0.8, step: 2 },
		vignette: 0.7,
		crtBar: { speed: 6, height: 0.1, intensity: 0.5, fadeDistance: 0.25 },
		glitch: {
			chancePerSecond: 0.45,
			maxLines: 3,
			maxShift: 10,
			shiftFlipRatio: 0.75,
			colorGlitchChance: 0.4,
			minDuration: 0.05,
			maxDuration: 0.16,
			chromaticAberration: 0,
			chromaDropout: 0.4,
			corruptColors: [palette.sand, palette.sandBright, palette.gold, palette.red, palette.gray, palette.grayDim],
			blockChance: 0.8,
			maxBlocks: 4,
			tintChance: 0.75,
			maxTints: 3,
		},
	},

	barRamp: ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'],
	sparkRamp: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'],
}
