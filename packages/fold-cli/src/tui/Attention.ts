/**
 * Whether the terminal window has focus, and what that should change.
 *
 * An agent that runs long tools is meant to be left alone, which only works if
 * it can tell you when it wants you back. Notifying while you are watching the
 * screen is worse than not notifying at all: it trains you to ignore it.
 *
 * Terminals report focus through DEC mode 1004: enabling it makes the terminal
 * send `ESC [ I` when the window gains focus and `ESC [ O` when it loses it.
 * Support is wide (iTerm2, kitty, WezTerm, Alacritty, tmux, Ghostty) but not
 * universal, so focus starts `unknown` and stays there until the terminal says
 * otherwise. An `unknown` focus notifies, because a missed notification is a
 * worse failure than a redundant one.
 */
export type FocusState = 'unknown' | 'focused' | 'blurred'

/** Enable focus reporting. */
export const ENABLE_FOCUS_REPORTING = '\u001b[?1004h'

/** Disable it again, so the shell does not inherit a terminal that reports. */
export const DISABLE_FOCUS_REPORTING = '\u001b[?1004l'

/**
 * What a notification is for.
 *
 * Only the two events the runtime actually produces are listed. There is no
 * approval gate in fold: tools never wait for a human, so a `permission` kind
 * would be an interface with no caller, and a subagent-finished kind has no
 * producer either. Both were written and removed: a kind nothing emits is only
 * ever exercised by its own test, which then proves nothing about the product.
 * Add them back beside the code that raises them.
 */
export type AttentionKind =
	/** The session finished its turn and is waiting for you. */
	| 'turn_done'
	/** The turn failed. */
	| 'error'

/**
 * Whether to raise an OS notification.
 *
 * Notifying someone who is watching the screen is worse than not notifying at
 * all: it teaches them to ignore the next one.
 */
export const shouldNotify = (focus: FocusState): boolean => focus !== 'focused'

/** The message an OS notification carries. */
export const attentionMessage = (kind: AttentionKind, detail: string): string => {
	if (kind === 'error') return detail === '' ? 'Turn failed' : `Turn failed: ${detail}`
	return detail === '' ? 'Ready' : `Ready: ${detail}`
}

/**
 * Read focus changes out of a chunk of terminal input.
 *
 * Returns the last state in the chunk, because a chunk that contains both is a
 * window that was tabbed away from and back before we read it, and only where
 * it ended up matters. `null` means the chunk said nothing about focus.
 */
export const readFocusReport = (chunk: string): FocusState | null => {
	let state: FocusState | null = null
	for (let index = 0; index < chunk.length; index += 1) {
		if (chunk[index] !== '\u001b' || chunk[index + 1] !== '[') continue
		const marker = chunk[index + 2]
		if (marker === 'I') state = 'focused'
		else if (marker === 'O') state = 'blurred'
	}
	return state
}

/**
 * An OS notification, as an escape sequence.
 *
 * OSC 777 is what notify-send-style terminals accept, and OSC 9 is the older
 * iTerm2 form; both are ignored by terminals that do not implement them, which
 * is the reason to prefer them over shelling out to `osascript` or
 * `notify-send`: no process, no platform detection, and no dependency.
 */
export const notificationSequence = (title: string, body: string): string => {
	// A stray BEL or ESC in the body would end the sequence early and spill the
	// rest onto the screen. Split and join rather than a regex, because a
	// character class of control characters is exactly what the linter warns
	// about and it is right to: it is almost always a mistake, just not here.
	const clean = (value: string): string => value.split('\u0007').join(' ').split('\u001b').join(' ')
	return `\u001b]777;notify;${clean(title)};${clean(body)}\u0007`
}
