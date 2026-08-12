import { Schema } from 'effect'

/**
 * Parked drafts, so an interruption does not cost the message.
 *
 * A composer is the one place in this TUI where the user has produced
 * something the app cannot regenerate. Today an interruption throws it away:
 * you are halfway through describing a task, a permission prompt or a subagent
 * needs attention, and the draft is gone. Stashing is the cheapest possible
 * answer, which is why it is worth having before anything more clever.
 *
 * Stored as JSONL for the same reason the event log is: an append is one line
 * and a truncated tail costs one entry rather than the file.
 */
export const StashEntry = Schema.Struct({
	text: Schema.String,
	/** Epoch millis, used only to order and to label. */
	ts: Schema.Number,
})
export type StashEntry = typeof StashEntry.Type

/**
 * How many drafts to keep.
 *
 * A stash is not a history. Past a couple of dozen the list stops being
 * something you scan and becomes something you search, and it is not worth
 * building a search for parked drafts.
 */
export const MAX_STASH_ENTRIES = 25

/**
 * Parse a stash file, keeping the newest entries.
 *
 * A line that does not parse is dropped rather than failing the file: a stash
 * is a convenience, and refusing to open it because of one bad line would cost
 * the user every draft to protect one.
 */
export const parseStash = (contents: string): ReadonlyArray<StashEntry> => {
	const entries: Array<StashEntry> = []
	for (const line of contents.split('\n')) {
		if (line.trim() === '') continue
		try {
			const parsed: unknown = JSON.parse(line)
			const decoded = Schema.decodeUnknownSync(StashEntry)(parsed)
			entries.push(decoded)
		} catch {
			continue
		}
	}
	return entries.slice(-MAX_STASH_ENTRIES)
}

/** One line per entry, newest last, ready to write. */
export const serializeStash = (entries: ReadonlyArray<StashEntry>): string =>
	entries.length === 0 ? '' : `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`

/**
 * Add a draft, dropping the oldest if the stash is full.
 *
 * Blank drafts are not stashed: stashing an empty composer is always a
 * mistake, and a stash full of blanks is worse than no stash.
 */
export const pushStash = (entries: ReadonlyArray<StashEntry>, text: string, now: number): ReadonlyArray<StashEntry> => {
	if (text.trim() === '') return entries
	return [...entries, { text, ts: now }].slice(-MAX_STASH_ENTRIES)
}

/** Remove one entry by index, for a pop or an explicit delete. */
export const dropStash = (entries: ReadonlyArray<StashEntry>, index: number): ReadonlyArray<StashEntry> =>
	index < 0 || index >= entries.length ? entries : [...entries.slice(0, index), ...entries.slice(index + 1)]

/**
 * A one-line label for a stashed draft.
 *
 * The first line is what the user recognises it by, so newlines collapse
 * rather than truncate: a draft whose first line is short but whose second
 * line is the point would otherwise be unidentifiable.
 */
export const stashLabel = (entry: StashEntry, width: number): string => {
	const flat = entry.text.replaceAll(/\s+/g, ' ').trim()
	if (width <= 1) return flat.slice(0, Math.max(0, width))
	return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`
}
