# Fold TUI theme — a reproduction guide

Everything needed to rebuild fold's terminal look, in any terminal UI, without reading the
source. It documents the color system and its contrast floors, the typography, the layout
chrome, and — in detail — the (default-off) post-processing chain, including the glitch effect.

The reference implementation is `packages/fold-tui-theme`, built on
[OpenTUI](https://github.com/anomalyco/opentui). The ideas need only a terminal renderer that
exposes a per-cell buffer of `{ char, fgColor, bgColor, attributes }`.

fold ships **one** theme, `HIGH CONTRAST`. Six themes existed before; every one of them buried
its labels and borders in a dim tier that measured 2.4–4.6:1 against its own background. The
single surviving palette is built on the geometry of opencode's default dark theme and held
above fixed WCAG contrast floors — see §4.

---

## 1. The premise

The screen is a **near-black canvas** and the UI supplies the light. Backgrounds stay dark
(`#0a0a0a` void, `#141414` panel, `#1e1e1e` raised) so foregrounds carry maximum contrast.

- Color is a **classification channel**: a reader should tell what kind of thing they are
  looking at from its hue, without reading it — but hue **never** carries meaning alone (see
  §4.5 on color-blindness). State is paired with a glyph and/or weight.
- Brightness is a **depth channel**: bright things are active, dim things recede into structure.
- Chrome is machine-like: uppercase, monospaced, bracketed, abbreviated.
- **Readability is non-negotiable.** Every foreground tier clears a fixed contrast floor (§4).

---

## 2. The rule that makes it maintainable

**No color literal may exist outside the theme file.** Every component asks for a _role_, never
a hue:

```tsx
<text fg={color.core}>       // not fg="#fab283"
<text fg={color.alert}>      // not fg="red"
```

A theme is a plain data object mapping roles → hex strings. This keeps the aesthetic in ~120
lines of data and the components colorless.

---

## 3. The token interface

```ts
interface Theme {
	name: string // 'HIGH CONTRAST'
	tagline: string // 'READABLE // NOMINAL'
	color: ThemeColors
	chrome: ThemeChrome
	semantic: ThemeSemantic
	fx: PostFx
	barRamp: readonly string[] // ▏▎▍▌▋▊▉█   left-to-right, for horizontal bars
	sparkRamp: readonly string[] // ▁▂▃▄▅▆▇█   bottom-up, for sparklines
}

interface ThemeColors {
	void: string // the canvas. near-black, not pure black.
	panel: string // panel fill.
	raised: string // fill behind a selected row.

	core: string // FOUNDATION: titles, primary readouts, the warm-sand primary
	coreBright: string // the hot highlight
	coreDim: string // dim structural tone (still >= 7:1)

	grid: string // COOL RELIEF: structural data, labels, inline code, refs
	gridDim: string // borders-in-text, scrollbar tracks

	inject: string // "INJECTED": cross-references, count badges, bullets, highlights
	alert: string // CRITICAL: failures, destructive edges. Rare, always glyph-paired.

	text: string // body copy
	textDim: string // secondary — labels, borders, footers. The whole point of the theme.
	textFaint: string // tertiary scaffolding
}
```

`ThemeChrome` (`frameStyle`, `panelStyle`, `border`, `title`, `heading`) and `ThemeSemantic`
(`open`/`closed`/`merged`/`draft`) are unchanged. `PostFx` (glow, scanlines, vignette, crtBar,
glitch) is retained in full so `hud/postfx.ts` keeps compiling; the passes ship OFF.

---

## 4. Color — and the contrast floors

### 4.1 The palette

Built on opencode's default dark theme. The neutral ramp (`void`/`panel`/`raised`), the body
`text`, and the warm-sand primary (`core`/`coreBright`) are opencode's exact values; the muted
and border tiers are lifted well past opencode's own numbers so labels stay readable.

| Role         | Hex       | Source                                     |
| ------------ | --------- | ------------------------------------------ |
| `void`       | `#0a0a0a` | opencode background                        |
| `panel`      | `#141414` | opencode panel                             |
| `raised`     | `#1e1e1e` | opencode element                           |
| `core`       | `#fab283` | opencode primary (warm sand)               |
| `coreBright` | `#ffc09f` | opencode primaryHi                         |
| `coreDim`    | `#e0a860` | lifted dim sand                            |
| `grid`       | `#68c6d2` | opencode cyan, lifted to clear 7:1         |
| `gridDim`    | `#56b6c2` | opencode cyan                              |
| `inject`     | `#bda6f0` | opencode purple accent, lifted past 7:1    |
| `alert`      | `#ef8a94` | opencode red, lifted past 7:1              |
| `text`       | `#eeeeee` | opencode text                              |
| `textDim`    | `#b6b2ab` | lifted far past opencode's 5.0:1 textMuted |
| `textFaint`  | `#949089` | lifted muted/faint tier                    |
| `border`     | `#828282` | lifted from opencode's 1.8–3.1:1 borders   |

### 4.2 The contrast floors — the rule, not a vibe

Measured against the `void` (`#0a0a0a`) with WCAG 2.1 relative luminance
`L = 0.2126·R + 0.7152·G + 0.0722·B` on linearized channels:

| Tier / accent     | Floor                             | Measured (void / panel / raised) |
| ----------------- | --------------------------------- | -------------------------------- |
| `text`            | ≥ 13:1                            | 17.1 / 15.9 / 14.4               |
| `textDim`         | ≥ 8:1 on void AND ≥ 7:1 on raised | 9.4 / 8.7 / 7.9                  |
| `textFaint`       | ≥ 5.5:1                           | 6.2 / 5.8 / 5.3                  |
| `core`            | ≥ 7:1                             | 11.1 / 10.3 / 9.3                |
| `coreBright`      | ≥ 7:1                             | 12.5 / 11.7 / 10.6               |
| `coreDim`         | ≥ 7:1                             | 9.4 / 8.7 / 7.9                  |
| `grid`            | ≥ 7:1                             | 10.0 / 9.3 / 8.4                 |
| `gridDim`         | ≥ 7:1                             | 8.4 / 7.8 / 7.0                  |
| `inject`          | ≥ 7:1                             | 9.3 / 8.7 / 7.8                  |
| `alert`           | ≥ 7:1                             | 8.2 / 7.7 / 6.9                  |
| `border` / chrome | ≥ 4.5:1                           | 5.2 / 4.8 / 4.3                  |

Any `text` drawn on a `raised`/selected row keeps ≥ 7:1 (measured 14.4:1). When you change a
hex, recompute its ratio and keep it above its floor.

### 4.3 Semantic mapping

| State    | Slot          | Glyph |
| -------- | ------------- | ----- |
| `open`   | `core` (sand) | `◇`   |
| `merged` | `grid` (cyan) | `◆`   |
| `closed` | `alert` (red) | `✕`   |
| `draft`  | `textDim`     | `◌`   |

### 4.4 The glow threshold (default-off)

The glow pass lights only glyphs whose foreground luminance exceeds a threshold (`0.6`). With
all fx off by default this never runs, but the token is kept so an embedder can opt in. If you
re-enable it, place the threshold in the gap between the tier you want lit and the tier you want
crisp, and tune by background-luminance percentiles, not by eye (§8).

### 4.5 Color-blindness

Meaning is never signaled by red-vs-green alone. The palette has no green slot; `open` is sand
and `closed` is red, and each state is paired with a distinct glyph (`◇` / `◆` / `✕` / `◌`) via
`ActivityIndicator`, so deuteranopic and protanopic readers get the state from shape and
lightness, not hue.

---

## 5. Typography

One font: whatever monospace the terminal has. Expression comes from case, attributes,
punctuation, and glyph choice.

**Case.** Chrome is `ALL CAPS`. User content keeps its original case.

**Markdown roles follow opencode's defaults**, mapped onto fold's slots (all ≥ 7:1): heading →
`inject` (accent/purple), link → `core` (primary/sand), strong → `core` (orange-sand),
emphasis/blockquote → `coreDim` (yellow/gold), list markers and fenced/inline code → `grid`
(cyan). fold has no dedicated green slot, so code uses the cool `grid` tone rather than
opencode's green. See `packages/fold-cli/src/tui/MarkdownStyle.ts`.

**Attributes are a depth channel, not emphasis.** `BOLD` marks the active/selected thing; `DIM`
pushes an element behind the plane of the text.

**Glyphs** must be narrow and unambiguous-width: ASCII, box-drawing, block elements. The
working inventory: domain states `◇ ◆ ✕ ◌`, selection caret `▸`, bullets `▪`, bar fill `█` plus
`barRamp`, sparkline `sparkRamp`, borders via `single`/`heavy` box-drawing.

---

## 6. Layout and chrome

One bordered-panel primitive is used everywhere: a bordered box with a padded title.

```tsx
<box border borderStyle={chrome.panelStyle} borderColor={chrome.border}
     title=" STATE " titleColor={chrome.title} backgroundColor={color.panel} paddingX={1}>
```

Panels stack without gaps; `paddingX={1}` inside, never vertical padding; rows 1 cell tall;
numbers right-aligned with `padStart`, labels left-aligned with `padEnd`. A selected row gets
three simultaneous signals: a caret `▸`, a `raised` background band, and `BOLD` + `coreBright`
on its identifier. Below ~118 columns the right rail drops; below ~84 the list narrows.

---

## 7. Motion and post-processing (default OFF)

The CRT post-process chain — glow → vignette → scanlines → CRT rolling bar → glitch — is fully
retained in `src/hud/postfx.ts` but **ships disabled**: the app's default `FxToggles` turns
every pass off, and each theme pass runs only when the theme declares it _and_ a runtime toggle
permits it. The documentation of the glow, the rolling bar, and the glitch director (bursts of
`shift`/`flip`/`color` row corruption, chroma dropout, and injected color blocks/tints) is kept
in the source comments of `postfx.ts` and `GlowEffect.ts` for anyone who opts back in. The rule
if you do: the injection pass must run **last**, or dropout desaturates the very blocks meant to
carry the hue.

---

## 8. Verifying it, without trusting your eyes

A terminal screenshot lies. Measure instead.

- **Contrast.** Compute the WCAG ratio of every foreground tier against `void`, `panel` and
  `raised`, and confirm each clears its floor (§4.2). This is the primary check.
- **Foreground histogram.** `scripts/preview.tsx --spans` counts non-space cells by foreground
  color. The top colors should be your _exact_ theme hexes; `#ffffff` at the top means a glow
  is washing the foreground.
- **Background luminance distribution.** If you re-enable the glow, median ≈ 0 with a high p99
  means a halo; a flat distribution means a wash.

---

## 9. Reproduction checklist

1. Set the canvas near-black (`#0a0a0a`), panel and raised one small step above.
2. Write the token interface (§3). Ban color literals outside it.
3. Choose a foundation hue (warm sand) and its bright/dim tiers, one cool relief pair, one
   "injected" hue, one critical hue, and a three-step text ramp.
4. **Compute the WCAG contrast of every token against the void, panel and raised, and lift each
   until it clears its floor (§4.2). This is the load-bearing step.**
5. Map domain states onto slots and pair each with a glyph — no meaning by hue alone, no green.
6. Uppercase all chrome; restrict yourself to narrow glyphs.
7. Build one bordered-panel primitive and use it everywhere.
8. Keep the fx chain retained but OFF by default.
9. Measure contrast before shipping any hex change.
