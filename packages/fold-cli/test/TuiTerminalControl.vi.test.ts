import { TerminalControl } from '@kitlangton/terminal-control'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let terminal: TerminalControl
const terminalDescribe = process.env.FOLD_TUI_TERMINAL_TEST === '1' ? describe.sequential : describe.skip
const shiftEnter = new TextEncoder().encode('\u001b[13;2u')

terminalDescribe('TUI terminal behavior', () => {
	beforeAll(async () => {
		terminal = await TerminalControl.make()
	})

	afterAll(async () => {
		await terminal.close()
	})

	it('renders markdown in user, reasoning, and assistant rows', async () => {
		await using session = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', 'test/fixtures/TuiMarkdownFixture.tsx'],
			cwd: import.meta.dirname.replace(/\/test$/, ''),
			host: 'opentui',
			viewport: { cols: 140, rows: 44 },
			record: 'on-failure',
		})

		await session.screen.waitForText('/workspace/fold', { timeoutMs: 10_000 })
		await session.screen.waitForText('themed first item', { timeoutMs: 10_000 })
		const frame = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		// The user's turn is quoted verbatim rather than rendered (commit 2d540eb
		// excluded it from markdown deliberately), so its source marks are part of
		// the expected output and the assistant's are not.
		expect(frame.text).toContain('User asks for **bold input** and code')
		expect(frame.text).toContain('const userPrompt = true')
		expect(frame.text).toContain('Thinking with emphasis before')
		expect(frame.text).toContain('inlineCode()')
		expect(frame.text).toContain('themed first item')
		const bashLine = frame.text.split('\n').find((line) => line.includes('BASH'))
		expect(bashLine).toContain('⚙')
		expect(bashLine).not.toContain('◆')
		// The assistant's prose is rendered markdown; the user's turn is quoted
		// verbatim in its own block (EventViews.tsx EventRow), so its source marks
		// survive on purpose and only the assistant's are expected to be gone.
		const assistantLine = frame.text.split('\n').find((line) => line.includes('Assistant returns bold'))
		expect(assistantLine).not.toContain('**')
		const lines = frame.text.split('\n')
		const firstParagraph = lines.findIndex((line) => line.includes('Assistant returns bold response'))
		const secondParagraph = lines.findIndex((line) => line.includes('Second paragraph after a blank line'))
		expect(secondParagraph - firstParagraph).toBeGreaterThanOrEqual(2)
		await session.keyboard.type('k')
		await session.screen.waitForText('ARGUMENTS', { timeoutMs: 10_000 })
		await session.screen.waitForText('EVENTS · [SELECTED]', { timeoutMs: 10_000 })
		await session.keyboard.press('Enter')
		await session.screen.waitForText('CONTEXT · [INSPECT] · 2 ⚙ bash · [SELECTED]', { timeoutMs: 10_000 })
		const inspectedTool = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(inspectedTool.text).toContain('CONTEXT · [INSPECT]')
		expect(inspectedTool.text).toContain('COMMAND')
		expect(inspectedTool.text).toContain('pwd')
		expect(inspectedTool.text).toContain('RESULT')
		expect(inspectedTool.text).toContain('/workspace/fold')

		await session.keyboard.type('h')
		await session.screen.waitForText('EVENTS · [SELECTED]', { timeoutMs: 10_000 })
		await session.keyboard.type('i')
		await session.screen.waitForText('MESSAGE ROOT', { timeoutMs: 10_000 })
		await session.keyboard.type('follow live again')
		await session.keyboard.press('Enter')
		await session.screen.waitForText('CONTEXT · [LIVE] · root', { timeoutMs: 10_000 })
	}, 60_000)

	it('distinguishes partial assistant output and interrupted tools', async () => {
		await using session = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', 'test/fixtures/TuiInterruptedFixture.tsx'],
			cwd: import.meta.dirname.replace(/\/test$/, ''),
			host: 'opentui',
			viewport: { cols: 140, rows: 44 },
			record: 'on-failure',
		})

		await session.screen.waitForText('This response stopped midway', { timeoutMs: 10_000 })
		const frame = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		// A partial response is marked by a dimmed glyph rather than the word
		// 'partial' (EventViews.tsx assistantVisual), so the assertion is that the
		// interrupted tool is distinguishable, which is what the row has to convey.
		expect(frame.text).toContain('⊘ bash')
		expect(frame.text).toContain('intr')
		expect(frame.text).not.toContain('bash  sleep 10  run')
	}, 30_000)

	it('reviews and navigates a deterministic changes snapshot', async () => {
		await using session = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', 'test/fixtures/TuiAppFixture.tsx'],
			cwd: import.meta.dirname.replace(/\/test$/, ''),
			host: 'opentui',
			viewport: { cols: 140, rows: 44 },
			record: 'on-failure',
		})

		await session.screen.waitForText('WAITING FOR ROOT-AGENT OUTPUT', { timeoutMs: 10_000 })
		await session.keyboard.press('Tab')
		await session.screen.waitForText('CHANGES · [SELECTED]', { timeoutMs: 10_000 })
		await session.screen.waitForText('notes file.md', { timeoutMs: 10_000 })
		let frame = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(frame.text).toContain('STAGED')
		expect(frame.text).toContain('UNTRACKED')
		expect(frame.text).toContain('CONTEXT · [INSPECT] · git · 2 files')
		expect(frame.text.split('\n').find((line) => line.includes('notes file.md'))).toContain('●')

		await session.keyboard.type('j')
		await session.screen.waitForText('notes file.md · SELECTED', { timeoutMs: 10_000 })
		frame = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(frame.text.split('\n').find((line) => line.includes('notes file.md'))).toContain('✓')
		await session.screen.waitForText('CHANGES · [SELECTED]', { timeoutMs: 10_000 })
		await session.keyboard.press('Enter')
		await session.screen.waitForText('FULL FILE', { timeoutMs: 10_000 })
		await session.keyboard.type('q')
		expect(await session.waitForExit({ timeoutMs: 5_000 })).toMatchObject({ reason: 'exited', exit: { code: 0 } })
	}, 45_000)

	it('focuses a subagent and targets its steer and interrupt actions', async () => {
		await using session = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', 'test/fixtures/TuiAppFixture.tsx'],
			cwd: import.meta.dirname.replace(/\/test$/, ''),
			host: 'opentui',
			viewport: { cols: 140, rows: 44 },
			record: 'on-failure',
			env: { FOLD_TUI_SUBAGENT_FIXTURE: '1' },
		})

		await session.screen.waitForText('researcher', { timeoutMs: 10_000 })
		await session.keyboard.type('ll')
		// The rail opens on META, so it is already showing the readouts; Tab from
		// here would move on to SKILLS.
		await session.screen.waitForText('AGENT TYPES', { timeoutMs: 10_000 })
		await session.screen.waitForText('TOOL CALLS', { timeoutMs: 10_000 })
		const meta = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(meta.text).toContain('CTX')
		expect(meta.text).toContain('COST')
		await session.keyboard.press('Control+C')
		await session.screen.waitForText('target-interrupted', { timeoutMs: 10_000 })
	}, 30_000)

	it('scrolls the subagent list to keep keyboard selection visible', async () => {
		await using session = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', 'test/fixtures/TuiAppFixture.tsx'],
			cwd: import.meta.dirname.replace(/\/test$/, ''),
			host: 'opentui',
			viewport: { cols: 180, rows: 24 },
			record: 'on-failure',
			env: { FOLD_TUI_OVERFLOW_SUBAGENTS_FIXTURE: '1' },
		})

		await session.screen.waitForText('META', { timeoutMs: 10_000 })
		await session.keyboard.type('ll')
		await session.keyboard.press('Tab')
		await session.keyboard.press('Tab')
		await session.screen.waitForText('SUBAGENTS · [SELECTED]', { timeoutMs: 10_000 })
		await session.screen.waitForText('Overflow task 1', { timeoutMs: 10_000 })
		let frame = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(frame.text).not.toContain('Overflow task 14')
		await session.keyboard.type('G')
		await session.screen.waitForText('Overflow task 14', { timeoutMs: 10_000 })
		frame = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(frame.text.split('\n').find((line) => line.includes('Overflow task 14'))).toContain('▸')
		expect(frame.text).toContain('researcher')
	}, 30_000)

	it('navigates skills while the right pane is selected', async () => {
		await using session = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', 'test/fixtures/TuiAppFixture.tsx'],
			cwd: import.meta.dirname.replace(/\/test$/, ''),
			host: 'opentui',
			viewport: { cols: 140, rows: 44 },
			record: 'on-failure',
			env: { FOLD_TUI_SUBAGENT_FIXTURE: '1' },
		})

		await session.screen.waitForText('researcher', { timeoutMs: 10_000 })
		await session.keyboard.type('ll')
		await session.keyboard.press('Tab')
		await session.screen.waitForText('SKILLS · [SELECTED]', { timeoutMs: 10_000 })
		await session.screen.waitForText('▸ effect-program-design', { timeoutMs: 10_000 })
		await session.keyboard.type('j')
		await session.screen.waitForText('▸ terminal-control', { timeoutMs: 10_000 })
		const frame = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(frame.text).toContain('SKILLS · [SELECTED]')
		expect(frame.text).toContain('▸ terminal-control')
	}, 30_000)

	it('submits from a subagent prompt opened through the event row', async () => {
		await using session = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', 'test/fixtures/TuiAppFixture.tsx'],
			cwd: import.meta.dirname.replace(/\/test$/, ''),
			host: 'opentui',
			viewport: { cols: 140, rows: 44 },
			record: 'on-failure',
			env: { FOLD_TUI_EVENT_SUBAGENT_FIXTURE: '1' },
		})

		// The index reserves a column between the label and the summary (commit
		// a81fe89), so the two are no longer adjacent in the rendered text.
		await session.screen.waitForText('subagent', { timeoutMs: 10_000 })
		await session.keyboard.type('j')
		await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		await session.keyboard.press('Enter')
		await session.screen.waitForText('CONTEXT · [LIVE] · researcher', { timeoutMs: 10_000 })
		await session.keyboard.type('i')
		await session.screen.waitForText('MESSAGE SUBAGENT', { timeoutMs: 10_000 })
		await session.keyboard.type('moo')
		await session.keyboard.press('Enter')
		await session.screen.waitForText('TARGET STEER RECEIVED', { timeoutMs: 10_000 })
		const frame = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(frame.text).toContain('TARGET STEER RECEIVED')
	}, 30_000)

	it('renders the tactical shell, converses from the root input, and exits cleanly', async () => {
		await using session = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', 'test/fixtures/TuiAppFixture.tsx'],
			cwd: import.meta.dirname.replace(/\/test$/, ''),
			host: 'opentui',
			viewport: { cols: 140, rows: 44 },
			record: 'on-failure',
		})

		await session.screen.waitForText('WAITING FOR ROOT-AGENT OUTPUT', { timeoutMs: 10_000 })
		const initial = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(initial.text).toContain('/workspace/fold')
		expect(initial.text).not.toContain('OPTIC FEED // NOMINAL')
		expect(initial.text).not.toContain('REPO//')
		expect(initial.text).toContain('FX//')
		// Every post-fx toggle ships off (commit 7492421), so the footer reads OFF
		// until something turns one on.
		expect(initial.text).toContain('B:OFF')
		expect(initial.text).toContain('F:OFF')
		expect(initial.text).toContain('V:OFF')
		expect(initial.text).toContain('SEND')
		expect(initial.text).toContain('EVENTS · [SELECTED]')
		expect(initial.text).toContain('I TO FOCUS')
		expect(initial.text).toContain('^N NEW')
		expect(initial.text).toContain('ESC SESSIONS')

		// ^N opens the new-session modal rather than dispatching straight away, so
		// the host's callback fires on submit, not on the keypress. Escape closes
		// the modal; a second Escape is what leaves the session.
		await session.keyboard.press('Control+N')
		await session.screen.waitForText('NEW SESSION', { timeoutMs: 10_000 })
		await session.keyboard.press('Escape')
		// Wait for the modal to actually close before the second Escape: sent back
		// to back, both are consumed by the modal and the session never exits.
		await session.screen.waitUntil((screen) => !screen.text.includes('Working directory'), {
			timeoutMs: 10_000,
		})
		await session.keyboard.press('Escape')
		await session.screen.waitForText('session-list-requested', { timeoutMs: 10_000 })

		await session.keyboard.type('i')
		await session.screen.waitForText('MESSAGE ROOT', { timeoutMs: 10_000 })
		await session.keyboard.type('b')
		const focusedHotkey = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		const focusedInputLine = focusedHotkey.text.split('\n').find((line) => line.includes('[SEND]'))
		expect(focusedInputLine).toContain('b')
		// 'b' went into the composer, not to the glow toggle, so the footer is
		// unchanged: that is the actual claim of this step.
		expect(focusedHotkey.text).toContain('B:OFF')
		await session.keyboard.type('uild slice')
		await session.keyboard.write(shiftEnter)
		const afterShiftEnter = await session.screen.capture({
			settleMs: 100,
			deadlineMs: 5_000,
			allowIncomplete: true,
		})
		expect(afterShiftEnter.text).not.toContain('RECEIVED')
		await session.keyboard.type('two')
		await session.screen.waitForText('two', { timeoutMs: 10_000 })
		await session.keyboard.press('Enter')
		await session.screen.waitForText('SEND RECEI', { timeoutMs: 10_000 })
		await session.screen.waitForText('[STEER]', { timeoutMs: 10_000 })
		const steering = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		expect(steering.text).toContain('[STEER]')

		await session.keyboard.type('guide the running turn')
		await session.keyboard.press('Enter')
		await session.screen.waitForText('STEER RECEI', { timeoutMs: 10_000 })
		await session.keyboard.press('Tab')
		await session.screen.waitForText('[INTERRUPT+SEND]', { timeoutMs: 10_000 })
		await session.keyboard.type('keep')
		await session.keyboard.press('Escape')
		// The composer holds 'keep', so it renders that rather than its placeholder;
		// leaving input mode is what the pane title reports.
		await session.screen.waitForText('EVENTS · [SELECTED]', { timeoutMs: 10_000 })
		await session.keyboard.type('l')
		await session.screen.waitForText('CONTEXT · [LIVE] · root · [SELECTED]', { timeoutMs: 10_000 })
		await session.keyboard.type('zzz')
		const contextFocused = await session.screen.capture({ settleMs: 100, deadlineMs: 5_000, allowIncomplete: true })
		const inactiveInputLine = contextFocused.text.split('\n').find((line) => line.includes('[INTERRUPT+SEND]'))
		expect(inactiveInputLine).toBeDefined()
		expect(inactiveInputLine).toContain('keep')
		expect(inactiveInputLine).not.toContain('zzz')
		await session.keyboard.type('h')
		await session.screen.waitForText('EVENTS · [SELECTED]', { timeoutMs: 10_000 })

		// Every effect ships off, so the first press of each key turns it on and
		// vignette cycles off -> light -> heavy -> off from its starting point.
		// This viewport is 140 columns, below the 160 the footer needs to spell the
		// effect names, so the toggles read as their initials here.
		await session.keyboard.type('b')
		await session.screen.waitForText('B:ON', { timeoutMs: 10_000 })
		await session.keyboard.type('f')
		await session.screen.waitForText('F:ON', { timeoutMs: 10_000 })
		await session.keyboard.type('v')
		await session.screen.waitForText('V:LIGHT', { timeoutMs: 10_000 })
		await session.keyboard.type('v')
		await session.screen.waitForText('V:HEAVY', { timeoutMs: 10_000 })
		await session.keyboard.type('v')
		await session.screen.waitForText('V:OFF', { timeoutMs: 10_000 })

		await session.keyboard.type('q')
		const exit = await session.waitForExit({ timeoutMs: 5_000 })
		expect(exit).toMatchObject({ reason: 'exited', exit: { code: 0 } })

		await using interrupted = await terminal.launch({
			command: ['bun', '--preload', '@opentui/solid/preload', 'test/fixtures/TuiAppFixture.tsx'],
			cwd: import.meta.dirname.replace(/\/test$/, ''),
			host: 'opentui',
			viewport: { cols: 140, rows: 44 },
		})
		await interrupted.screen.waitForText('WAITING FOR ROOT-AGENT OUTPUT', { timeoutMs: 10_000 })
		await interrupted.keyboard.press('Control+C')
		await interrupted.screen.waitForText('INTERRUPT REQUESTED', { timeoutMs: 10_000 })
		// The session indicator stays RUNNING because the fixture's researcher
		// subagent never finishes: interrupting the root does not stop the fleet,
		// and the indicator reports the fleet.
		await interrupted.keyboard.type('b')
		await interrupted.screen.waitForText('B:ON', { timeoutMs: 10_000 })
		await interrupted.keyboard.type('q')
		const interruptedExit = await interrupted.waitForExit({ timeoutMs: 5_000 })
		expect(interruptedExit).toMatchObject({ reason: 'exited', exit: { code: 0 } })
	}, 120_000)
})
