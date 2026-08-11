import { dirname } from 'node:path'

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {
	EventLog,
	EventLogCorruptEntryError,
	EventLogInvalidEntryError,
	EventLogUnavailableError,
	LogEntry as LogEntrySchema,
	makeStoredLogEntry,
	type EventLogError,
	type EventLogService,
	type LogEntry,
	type LogEntryInput,
	type LogSeq,
} from '@humanlayer/fold-core'
import { Effect, FileSystem, Layer, PubSub, Ref, Schema, Semaphore, Stream, type PlatformError } from 'effect'

const textEncoder = new TextEncoder()

const entriesFrom = (entries: ReadonlyArray<LogEntry>, fromSeq: LogSeq) =>
	entries.filter((entry) => entry.seq >= fromSeq)

const unavailableError = (
	operation: 'append' | 'entries',
	message: string,
	retryable: boolean,
	cause: PlatformError.PlatformError,
) =>
	new EventLogUnavailableError({
		operation,
		message,
		retryable,
		cause,
	})

const corruptEntryError = (line: number, message: string, cause?: unknown, seq?: number) =>
	new EventLogCorruptEntryError({
		operation: 'entries',
		message,
		line,
		...(seq === undefined ? {} : { seq }),
		...(cause === undefined ? {} : { cause }),
	})

const invalidEntryError = (message: string, cause: unknown) =>
	new EventLogInvalidEntryError({
		operation: 'append',
		message,
		cause,
	})

/**
 * The complete lines of a JSONL file.
 *
 * A file that does not end in a newline was interrupted mid-append: a crash, a
 * full disk, or a kill between the write and the flush. That last line is a
 * fragment carrying no recoverable entry, and failing the load over it costs
 * the user every complete entry before it, which is the same trade the
 * backwards-sequence recovery below refuses to make.
 *
 * Only the final line is treated this way. A torn line anywhere else is not
 * explained by an interrupted append, so it still fails the load rather than
 * being skipped, because skipping it would hide real corruption.
 */
const jsonlLines = (contents: string): ReadonlyArray<string> => {
	if (contents.length === 0) return []
	if (contents.endsWith('\n')) return contents.slice(0, -1).split('\n')
	return contents.split('\n').slice(0, -1)
}

/**
 * The same entry at a corrected sequence, re-decoded so the renumbering cannot
 * smuggle a value the schema would reject.
 */
const renumbered = (
	entry: LogEntry,
	seq: number,
	lineNumber: number,
): Effect.Effect<LogEntry, EventLogCorruptEntryError> =>
	Schema.decodeUnknownEffect(LogEntrySchema)({ ...entry, seq }).pipe(
		Effect.mapError((cause) =>
			corruptEntryError(lineNumber, `Unable to renumber EventLog entry at line ${lineNumber}`, cause),
		),
	)

const decodeJsonlLine = (
	line: string,
	lineNumber: number,
	previousSeq: number | null,
): Effect.Effect<LogEntry, EventLogCorruptEntryError> =>
	Effect.gen(function* () {
		if (line.length === 0) {
			return yield* corruptEntryError(lineNumber, `Empty JSONL line at line ${lineNumber}`)
		}

		const parsed = yield* Effect.try({
			try: (): unknown => JSON.parse(line),
			catch: (cause) => corruptEntryError(lineNumber, `Invalid JSON at line ${lineNumber}`, cause),
		})
		const entry = yield* Schema.decodeUnknownEffect(LogEntrySchema)(parsed).pipe(
			Effect.mapError((cause) =>
				corruptEntryError(lineNumber, `Invalid EventLog entry at line ${lineNumber}`, cause),
			),
		)
		// The invariant a reader depends on is that sequences advance, not that
		// they match the line index. Requiring equality made one bad append
		// condemn the whole conversation, including every entry written before
		// it.
		//
		// A sequence that goes backwards is a real defect, but the entries either
		// side of the seam are intact and in time order, so refusing to open the
		// file costs the user the conversation to punish a number. The entry is
		// renumbered in memory instead; the file on disk is left alone, and the
		// next append continues past the highest seq seen.
		if (previousSeq !== null && entry.seq <= previousSeq) {
			return yield* renumbered(entry, previousSeq + 1, lineNumber)
		}

		return entry
	})

const decodeJsonl = (contents: string): Effect.Effect<ReadonlyArray<LogEntry>, EventLogCorruptEntryError> =>
	Effect.gen(function* () {
		const decoded: Array<LogEntry> = []
		let previousSeq: number | null = null
		for (const [index, line] of jsonlLines(contents).entries()) {
			const entry: LogEntry = yield* decodeJsonlLine(line, index + 1, previousSeq)
			decoded.push(entry)
			previousSeq = entry.seq
		}
		return decoded
	})

const encodeJsonlLine = (entry: LogEntry): Effect.Effect<string, EventLogInvalidEntryError> =>
	Effect.gen(function* () {
		const encoded = yield* Schema.encodeUnknownEffect(LogEntrySchema)(entry).pipe(
			Effect.mapError((cause) => invalidEntryError('Unable to encode EventLog entry', cause)),
		)

		return yield* Effect.try({
			try: () => `${JSON.stringify(encoded)}\n`,
			catch: (cause) => invalidEntryError('Unable to serialize EventLog entry as JSON', cause),
		})
	})

const loadEntries = (
	fs: FileSystem.FileSystem,
	filePath: string,
): Effect.Effect<ReadonlyArray<LogEntry>, EventLogCorruptEntryError | EventLogUnavailableError> =>
	Effect.gen(function* () {
		yield* fs
			.makeDirectory(dirname(filePath), { recursive: true })
			.pipe(
				Effect.mapError((cause) =>
					unavailableError('entries', `Unable to create EventLog directory for ${filePath}`, false, cause),
				),
			)
		const exists = yield* fs
			.exists(filePath)
			.pipe(
				Effect.mapError((cause) =>
					unavailableError('entries', `Unable to inspect EventLog file ${filePath}`, false, cause),
				),
			)

		if (!exists) return []

		const contents = yield* fs
			.readFileString(filePath)
			.pipe(
				Effect.mapError((cause) =>
					unavailableError('entries', `Unable to read EventLog file ${filePath}`, false, cause),
				),
			)

		return yield* decodeJsonl(contents)
	})

const appendJsonlLine = (
	fs: FileSystem.FileSystem,
	filePath: string,
	line: string,
): Effect.Effect<void, EventLogUnavailableError> =>
	Effect.scoped(
		Effect.gen(function* () {
			const file = yield* fs
				.open(filePath, { flag: 'a' })
				.pipe(
					Effect.mapError((cause) =>
						unavailableError('append', `Unable to open EventLog file ${filePath}`, true, cause),
					),
				)

			yield* file
				.writeAll(textEncoder.encode(line))
				.pipe(
					Effect.mapError((cause) =>
						unavailableError('append', `Unable to write EventLog file ${filePath}`, true, cause),
					),
				)
			yield* file.sync.pipe(
				Effect.mapError((cause) =>
					unavailableError('append', `Unable to fsync EventLog file ${filePath}`, true, cause),
				),
			)
		}),
	)

/** JSONL-backed EventLog layer. The provided file path represents one fold session. */
export const layerJsonl = (filePath: string): Layer.Layer<EventLog, EventLogError, FileSystem.FileSystem> =>
	Layer.effect(
		EventLog,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const initialEntries = yield* loadEntries(fs, filePath)
			const entriesRef = yield* Ref.make<ReadonlyArray<LogEntry>>(initialEntries)
			const pubsub = yield* PubSub.unbounded<LogEntry>()
			const appendLock = yield* Semaphore.make(1)

			/**
			 * The next sequence number, taken from the newest entry rather than
			 * from how many entries are in hand.
			 *
			 * `current.length` is only the right answer while the in-memory array
			 * is a complete prefix of the file. A session recorded on 2026-08-11
			 * resumed with a short view of its own log and wrote seq 28 after seq
			 * 56, which the reader rejects (`seq === lineNumber - 1`), so the whole
			 * conversation became unopenable while still listing in the picker.
			 * Counting from the last seq cannot produce a number already on disk,
			 * whatever the load returned.
			 */
			const nextSeq = (entries: ReadonlyArray<LogEntry>): number => {
				const newest = entries.at(-1)
				return newest === undefined ? 0 : newest.seq + 1
			}

			const append = Effect.fn('fold.event_log.jsonl.append')((input: LogEntryInput) =>
				appendLock.withPermit(
					Effect.gen(function* () {
						const current = yield* Ref.get(entriesRef)
						const stored = yield* makeStoredLogEntry(input, nextSeq(current))
						const line = yield* encodeJsonlLine(stored)

						yield* appendJsonlLine(fs, filePath, line)
						yield* Ref.set(entriesRef, [...current, stored])
						yield* PubSub.publish(pubsub, stored)

						return stored
					}),
				),
			)

			const entries: EventLogService['entries'] = (fromSeq = 0) =>
				Stream.fromIterableEffect(
					Ref.get(entriesRef).pipe(Effect.map((snapshot) => entriesFrom(snapshot, fromSeq))),
				)

			const subscribe: EventLogService['subscribe'] = (fromSeq = 0) =>
				Stream.unwrap(
					appendLock.withPermit(
						Effect.gen(function* () {
							const subscription = yield* PubSub.subscribe(pubsub)
							const snapshot = yield* Ref.get(entriesRef)

							return Stream.fromIterable(entriesFrom(snapshot, fromSeq)).pipe(
								Stream.concat(
									Stream.fromSubscription(subscription).pipe(
										Stream.filter((entry) => entry.seq >= fromSeq),
									),
								),
							)
						}),
					),
				)

			return { append, entries, subscribe }
		}),
	)

/** Node-backed JSONL EventLog layer using `@effect/platform-node/NodeFileSystem.layer`. */
export const layerJsonlNode = (filePath: string): Layer.Layer<EventLog, EventLogError> =>
	layerJsonl(filePath).pipe(Layer.provide(NodeFileSystem.layer))
