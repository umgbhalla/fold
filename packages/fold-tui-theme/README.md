# fold-tui-theme

A playable OpenTUI app that renders a GitHub PR/issue browser with **fold's single, shipped
theme** — `HIGH CONTRAST`. It exists as a live proving ground for the design tokens the real
Fold TUI consumes: the palette, the chrome, and the (default-off) CRT post-process chain.

fold used to ship six swappable themes. Every one of them failed the same way: the _dim_ tier
that carries most labels, borders, footers and secondary text measured **2.4–4.6:1** against
its own background, which is unreadable. There is now **one** palette, built on the geometry of
[opencode](https://github.com/anomalyco/opencode)'s default dark theme and held above fixed
WCAG 2.1 contrast floors (below). There is nothing to cycle and no way to pick a worse-looking
one.

For the design system itself — the palette, the contrast floors, the glow threshold, the
typography rules, and how the (off-by-default) glitch works — see **[STYLE.md](./STYLE.md)**.

## The contrast floors are the rule

Every foreground tier and every accent used for text is measured against the near-black `void`
with WCAG 2.1 relative luminance and held above a fixed floor. This is the whole point of the
theme; do not lower a value below its floor.

- `text` (body) **≥ 13:1**
- `textDim` (secondary — labels, borders, footers) **≥ 8:1 on `void` AND ≥ 7:1 on `raised`**
- `textFaint` (tertiary) **≥ 5.5:1**
- every accent used as foreground text — `core`, `coreBright`, `coreDim`, `grid`, `gridDim`,
  `inject`, `alert`, and all `semantic.*` — **≥ 7:1**
- `chrome.border` and other chrome **≥ 4.5:1**
- selection/raised backgrounds keep **≥ 7:1** for the `text` drawn on top of them
- hues stay distinguishable for deuteranopia/protanopia: meaning is **never** carried by
  red-vs-green alone — state is always paired with a glyph and/or weight

### Measured ratios

| Role         | Hex       | vs `void` | vs `panel` | vs `raised` |
| ------------ | --------- | --------- | ---------- | ----------- |
| `void`       | `#0a0a0a` | —         | —          | —           |
| `panel`      | `#141414` | —         | —          | —           |
| `raised`     | `#1e1e1e` | —         | —          | —           |
| `text`       | `#eeeeee` | 17.1      | 15.9       | 14.4        |
| `textDim`    | `#b6b2ab` | 9.4       | 8.7        | 7.9         |
| `textFaint`  | `#949089` | 6.2       | 5.8        | 5.3         |
| `core`       | `#fab283` | 11.1      | 10.3       | 9.3         |
| `coreBright` | `#ffc09f` | 12.5      | 11.7       | 10.6        |
| `coreDim`    | `#e0a860` | 9.4       | 8.7        | 7.9         |
| `grid`       | `#68c6d2` | 10.0      | 9.3        | 8.4         |
| `gridDim`    | `#56b6c2` | 8.4       | 7.8        | 7.0         |
| `inject`     | `#bda6f0` | 9.3       | 8.7        | 7.8         |
| `alert`      | `#ef8a94` | 8.2       | 7.7        | 6.9         |
| `border`     | `#828282` | 5.2       | 4.8        | 4.3         |

The palette keeps opencode's exact background (`#0a0a0a`), panel (`#141414`), element/raised
(`#1e1e1e`), body text (`#eeeeee`) and warm-sand primary (`#fab283` / `#ffc09f`). Where it
diverges: opencode's own `textMuted` is only 5.0:1 (4.2:1 on the element background) — the same
unreadability this theme exists to fix — so the muted and border tiers are lifted well past
opencode's numbers.

## Run it

From this directory (the repo is a Bun workspace; run `bun install` at the root once if you
haven't):

```bash
bun run demo
```

`--demo` forces the bundled fixtures, so it needs no network and no GitHub token. Use
`bun run start` to pull live data from GitHub instead. The app accepts `--repo <owner/repo>`
(default `humanlayer/fold`) and `--demo`.

Live data is best-effort: the client discovers a token from `GITHUB_TOKEN`, `GH_TOKEN`, or
`gh auth token`, and falls back to the fixtures on **any** failure — no token, no network,
rate limit, private repo, 404.

## The theming system

- **`Theme` is one flat token interface** (`src/theme/types.ts`): `name` / `tagline`, a `color`
  object, `chrome`, `semantic`, `fx`, and two block ramps — `barRamp` (`▏▎▍▌▋▊▉█`) and
  `sparkRamp` (`▁▂▃▄▅▆▇█`). `tactical.ts` defines a private local `palette` of raw colors and
  maps it onto those tokens.
- **No hex literal exists outside `src/theme/tactical.ts`.** Every component references a
  _slot_ — `color.core`, `color.inject`, `color.alert` — never a color. Slots are named by
  role, not hue: a foundation (`core`/`coreBright`/`coreDim`), a cool "augmentation" pair
  (`grid`/`gridDim`), an "injected" slot (`inject`), a critical slot (`alert`), and a text
  hierarchy.
- **The post-process chain is assembled from `fx` tokens** (`src/hud/postfx.ts`).
  `installPostFx(renderer, theme, toggles)` walks the `PostFx` tokens in a fixed order (glow →
  vignette → scanlines → CRT bar → glitch) and pushes one pass per token that is _both_ present
  in the theme and enabled by the runtime toggle. **All passes ship OFF by default** — the CRT
  look is opt-in and the theme is a clean, readable HUD out of the box. The `fx` shape is kept
  so `postfx.ts` still compiles and an embedder can re-enable them.
- **`semantic` maps GitHub states onto palette slots.** `open`/`closed`/`merged`/`draft` each
  name a color slot; the state's _glyph_ carries the meaning so sand-vs-red never signals by
  hue alone.

## Keybindings

| Key                    | Action                            |
| ---------------------- | --------------------------------- |
| `↑` / `k`, `↓` / `j`   | Move selection                    |
| `PageUp` / `PageDown`  | Jump 8 rows                       |
| `Tab`                  | Switch PULLS ↔ ISSUES             |
| `b`                    | Toggle glow (the `fx.glow` token) |
| `s`                    | Toggle scanlines                  |
| `f`                    | Toggle glitch                     |
| `v`                    | Toggle vignette                   |
| `r`                    | Toggle the scrolling CRT bar      |
| `q` / `Esc` / `Ctrl-C` | Quit                              |

There is no theme-cycle key: fold ships one theme.

## Verifying changes without a TTY

`scripts/preview.tsx` renders one frame into the test harness so you can iterate on layout and
geometry without launching the full app. It always uses the fixtures.

```bash
bun run scripts/preview.tsx --size 140x44
bun run scripts/preview.tsx --size 140x44 --keys tab,j,j   # drive to 3rd issue
bun run scripts/preview.tsx --size 140x44 --spans          # foreground-color histogram
bun run scripts/preview.tsx --size 90x30                   # narrow: rail drops
```

`--spans` prints a foreground-color histogram — every distinct color, how many _visible_
(non-space) cells it paints, and its share of the frame — the only way to weigh the palette
from the CLI. A rendered frame in a real terminal is the final arbiter of color.

## What this is not

This is a **theme playground, not production architecture.** `src/github/client.ts` is plain
`async`/`fetch` — deliberately **not** Effect, even though the rest of Fold is. The real Fold
TUI wires its data through Effect; do not cargo-cult this client into it.
