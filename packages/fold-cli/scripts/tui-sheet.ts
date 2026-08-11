/**
 * Render the TUI at several widths in one shot, so a layout change can be
 * judged against the widths where it actually breaks.
 *
 * The rail's failures are width-dependent and invisible at the one viewport the
 * terminal specs use: at 160 columns a subagent row reads
 * `▌ Overflow task 1  57y  ◓ RUNNING`, and at 100 it reads `▌  57y  ◓ RUNNING`,
 * because the description is the flexible cell and the fixed ones do not yield.
 * Looking at one width hides that, so this looks at all of them at once.
 *
 * ```sh
 * cd packages/fold-cli
 * bun run tui:sheet                       # default fixture, three widths
 * bun run tui:sheet --widths 80,100,120,160
 * bun run tui:sheet --fixture overflow    # 14 subagents
 * bun run tui:sheet --keys l,l,tab        # drive it before capturing
 * bun run tui:sheet --rows 46 --settle 400
 * ```
 */
import { TerminalControl } from '@kitlangton/terminal-control'

type Fixture = {
	readonly file: string
	readonly env: Readonly<Record<string, string>>
}

/**
 * The fixture states worth looking at, by the name you pass to `--fixture`.
 *
 * These mirror the `FOLD_TUI_*` switches inside the fixtures; naming them here
 * means a reviewer does not have to read the fixture to know what states exist.
 */
const fixtures: Readonly<Record<string, Fixture>> = {
	default: { file: 'test/fixtures/TuiAppFixture.tsx', env: {} },
	subagent: { file: 'test/fixtures/TuiAppFixture.tsx', env: { FOLD_TUI_SUBAGENT_FIXTURE: '1' } },
	event: { file: 'test/fixtures/TuiAppFixture.tsx', env: { FOLD_TUI_EVENT_SUBAGENT_FIXTURE: '1' } },
	overflow: { file: 'test/fixtures/TuiAppFixture.tsx', env: { FOLD_TUI_OVERFLOW_SUBAGENTS_FIXTURE: '1' } },
	stopped: { file: 'test/fixtures/TuiAppFixture.tsx', env: { FOLD_TUI_STOPPED_SUBAGENT_FIXTURE: '1' } },
	/** As a real session opens: composer focused, so `l` types instead of moving. */
	typing: {
		file: 'test/fixtures/TuiAppFixture.tsx',
		env: { FOLD_TUI_INPUT_FOCUSED_FIXTURE: '1', FOLD_TUI_OVERFLOW_SUBAGENTS_FIXTURE: '1' },
	},
	markdown: { file: 'test/fixtures/TuiMarkdownFixture.tsx', env: {} },
	interrupted: { file: 'test/fixtures/TuiInterruptedFixture.tsx', env: {} },
}

const flag = (name: string, fallback: string): string => {
	const index = process.argv.indexOf(`--${name}`)
	return index === -1 ? fallback : (process.argv[index + 1] ?? fallback)
}

const widths = flag('widths', '100,120,160')
	.split(',')
	.map((value) => Number.parseInt(value.trim(), 10))
	.filter((value) => Number.isFinite(value) && value > 0)
const rows = Number.parseInt(flag('rows', '44'), 10)
/**
 * 600 ms was not enough for a fixture that starts with the composer focused:
 * keys sent before the app mounts its keyboard handler are swallowed, and the
 * run then reports whatever the unpressed screen looks like. That produced two
 * false conclusions in a row (an "escape does not work" and a "dead branch is
 * live") before the race was spotted, so the default is now generous.
 */
const settleMs = Number.parseInt(flag('settle', '1200'), 10)
const fixtureName = flag('fixture', 'event')
const keys = flag('keys', '')
	.split(',')
	.map((value) => value.trim())
	.filter((value) => value.length > 0)

const fixture = fixtures[fixtureName]

/**
 * Keys that have to be pressed rather than typed.
 *
 * `--keys d,enter` used to type the letters `e n t e r` into the app, which
 * looks like it worked (the screen changes) while testing something else
 * entirely. Named keys are pressed; anything else is typed as literal text.
 */
const namedKeys = new Set(['enter', 'escape', 'tab', 'shift-tab', 'backspace', 'up', 'down', 'left', 'right', 'space'])

const sendKey = async (
	session: { keyboard: { type: (text: string) => Promise<unknown>; press: (key: string) => Promise<unknown> } },
	key: string,
): Promise<void> => {
	const lowered = key.toLowerCase()
	if (!namedKeys.has(lowered)) {
		await session.keyboard.type(key)
		return
	}
	// Arrows are `ArrowRight`, not `Right`: the bare name is rejected with
	// "missing field `value`", which reads like a harness bug rather than a
	// misspelled key.
	if (lowered === 'shift-tab') {
		// `press('Tab', { shift: true })` silently drops the modifier here: the app
		// receives `shift=false`. The escape sequence for back-tab does arrive
		// intact.
		await session.keyboard.type('\u001b[Z')
		return
	}
	const capitalised = lowered.charAt(0).toUpperCase() + lowered.slice(1)
	const arrows = new Set(['up', 'down', 'left', 'right'])
	const pressed = lowered === 'escape' ? 'Escape' : arrows.has(lowered) ? `Arrow${capitalised}` : capitalised
	await session.keyboard.press(pressed)
}

if (fixture === undefined) {
	console.error(`unknown fixture ${fixtureName}; known: ${Object.keys(fixtures).join(', ')}`)
	process.exit(1)
}

for (const [name, value] of Object.entries(fixture.env)) process.env[name] = value

const terminal = await TerminalControl.make()
try {
	for (const cols of widths) {
		await using session = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', fixture.file],
			cwd: process.cwd(),
			host: 'opentui',
			viewport: { cols, rows },
		})
		// The first paint is not the settled layout: flex widths resolve over a
		// frame or two, so a capture taken too early shows columns mid-collapse.
		await new Promise((resolve) => setTimeout(resolve, settleMs))
		for (const key of keys) {
			await sendKey(session, key)
			await new Promise((resolve) => setTimeout(resolve, 250))
		}
		const frame = await session.screen.capture({ settleMs: 150, deadlineMs: 5_000, allowIncomplete: true })
		console.log(`\n${'═'.repeat(cols)}`)
		console.log(`── ${fixtureName} · ${cols}x${rows}${keys.length === 0 ? '' : ` · keys ${keys.join(' ')}`}`)
		console.log('═'.repeat(cols))
		console.log(frame.text)
	}
} finally {
	await terminal.close()
}
