import { join } from 'node:path'

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { it, expect } from '@effect/vitest'
import {
	AgentId,
	EventLog,
	EventLogCorruptEntryError,
	MessageId,
	SessionId,
	StateId,
	type LogEntryInput,
} from '@humanlayer/fold-core'
import { Effect, Fiber, FileSystem, Stream } from 'effect'

import { layerJsonl } from '../../src/index'

const makeSessionStarted = (cwd: string): LogEntryInput => ({
	_tag: 'session_started',
	agentId: null,
	parentAgentId: null,
	toolCallId: null,
	version: 1,
	cwd,
	sessionId: SessionId.create(),
	rootAgentId: AgentId.create(),
	meta: {},
})

const makeToolState = (value: unknown): LogEntryInput => ({
	_tag: 'tool_state',
	agentId: AgentId.create(),
	parentAgentId: null,
	toolCallId: null,
	namespace: 'guard',
	stateId: StateId.create(),
	key: 'count',
	value,
})

it.effect('jsonl layer writes one entry per line and reopens existing logs', () =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'fold-event-log-' })
			const filePath = join(dir, 'session.jsonl')

			const firstRead = yield* Effect.gen(function* () {
				const log = yield* EventLog
				yield* log.append(makeSessionStarted('/tmp/one'))
				yield* log.append(makeSessionStarted('/tmp/two'))
				yield* log.append(makeToolState(41))

				return yield* Stream.runCollect(log.entries())
			}).pipe(Effect.provide(layerJsonl(filePath)))

			const contents = yield* fs.readFileString(filePath)
			const lines = contents.split('\n').filter((line) => line.length > 0)
			const reopenedRead = yield* Effect.gen(function* () {
				const log = yield* EventLog
				return yield* Stream.runCollect(log.entries(1))
			}).pipe(Effect.provide(layerJsonl(filePath)))

			expect(firstRead.map((entry) => entry.seq)).toEqual([0, 1, 2])
			expect(lines).toHaveLength(3)
			expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ _tag: 'session_started', seq: 0 })
			expect(JSON.parse(lines[1] ?? '{}')).toMatchObject({ _tag: 'session_started', seq: 1 })
			expect(JSON.parse(lines[2] ?? '{}')).toMatchObject({
				_tag: 'tool_state',
				seq: 2,
				namespace: 'guard',
				key: 'count',
				value: 41,
				toolCallId: null,
			})
			expect(reopenedRead.map((entry) => entry.seq)).toEqual([1, 2])
		}),
	).pipe(Effect.provide(NodeFileSystem.layer)),
)

it.effect('jsonl layer maps invalid persisted lines to EventLogCorruptEntryError', () =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'fold-event-log-' })
			const filePath = join(dir, 'corrupt.jsonl')

			yield* fs.writeFileString(filePath, '{not json}\n')

			const error = yield* Effect.gen(function* () {
				const log = yield* EventLog
				return yield* Stream.runCollect(log.entries())
			}).pipe(Effect.provide(layerJsonl(filePath)), Effect.flip)

			if (!(error instanceof EventLogCorruptEntryError)) {
				throw new Error(`expected EventLogCorruptEntryError, got ${error._tag}`)
			}
			expect(error.line).toBe(1)
		}),
	).pipe(Effect.provide(NodeFileSystem.layer)),
)

/**
 * The defect that made a real session permanently unopenable: a resume wrote a
 * sequence that restarted mid-file (0..56, then 28..31). The reader required
 * `seq === lineNumber - 1`, so one bad append condemned every entry written
 * before it too.
 */
it.effect('jsonl layer reads a log whose sequence advances with gaps', () =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'fold-event-log-' })
			const filePath = join(dir, 'gapped.jsonl')

			yield* Effect.gen(function* () {
				const log = yield* EventLog
				yield* log.append(makeSessionStarted('/tmp/one'))
				yield* log.append(makeToolState(1))
			}).pipe(Effect.provide(layerJsonl(filePath)))

			// Rewrite the second entry with a seq that skips ahead, which is what a
			// log carrying a gap looks like on disk.
			const [first, second] = (yield* fs.readFileString(filePath)).split('\n').filter((l) => l.length > 0)
			const jumped = JSON.stringify({ ...JSON.parse(second ?? '{}'), seq: 41 })
			yield* fs.writeFileString(filePath, `${first}\n${jumped}\n`)

			const entries = yield* Effect.gen(function* () {
				const log = yield* EventLog
				return yield* Stream.runCollect(log.entries())
			}).pipe(Effect.provide(layerJsonl(filePath)))

			expect(Array.from(entries).map((entry) => entry.seq)).toEqual([0, 41])
		}),
	).pipe(Effect.provide(NodeFileSystem.layer)),
)

/**
 * A backwards sequence is a real defect, but the entries either side of the seam
 * are intact and time-ordered, so the reader renumbers rather than refusing to
 * open the conversation. This is the shape that made a real session unopenable.
 */
it.effect('jsonl layer recovers a sequence that goes backwards', () =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'fold-event-log-' })
			const filePath = join(dir, 'backwards.jsonl')

			yield* Effect.gen(function* () {
				const log = yield* EventLog
				yield* log.append(makeSessionStarted('/tmp/one'))
				yield* log.append(makeToolState(1))
			}).pipe(Effect.provide(layerJsonl(filePath)))

			const [first, second] = (yield* fs.readFileString(filePath)).split('\n').filter((l) => l.length > 0)
			const backwards = JSON.stringify({ ...JSON.parse(second ?? '{}'), seq: 0 })
			yield* fs.writeFileString(filePath, `${first}\n${backwards}\n`)

			const entries = yield* Effect.gen(function* () {
				const log = yield* EventLog
				return yield* Stream.runCollect(log.entries())
			}).pipe(Effect.provide(layerJsonl(filePath)))

			// Both entries survive, and the second is renumbered past the first.
			expect(Array.from(entries).map((entry) => entry.seq)).toEqual([0, 1])
		}),
	).pipe(Effect.provide(NodeFileSystem.layer)),
)

/**
 * Recovery must leave the whole log strictly increasing, including when a
 * renumbered entry would otherwise collide with a real sequence further down.
 * Two seams and a collision in one file.
 */
it.effect('jsonl layer recovery leaves every sequence strictly increasing', () =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'fold-event-log-' })
			const filePath = join(dir, 'seams.jsonl')

			yield* Effect.gen(function* () {
				const log = yield* EventLog
				yield* log.append(makeSessionStarted('/tmp/one'))
				for (const value of [1, 2, 3, 4]) yield* log.append(makeToolState(value))
			}).pipe(Effect.provide(layerJsonl(filePath)))

			// seq becomes 0, 5, 1, 2, 6: one seam whose repair (6) would collide
			// with the real 6 on the last line.
			const lines = (yield* fs.readFileString(filePath)).split('\n').filter((l) => l.length > 0)
			const rewritten = lines
				.map((line, index) => ({ ...JSON.parse(line), seq: [0, 5, 1, 2, 6][index] ?? index }))
				.map((entry) => JSON.stringify(entry))
			yield* fs.writeFileString(filePath, `${rewritten.join('\n')}\n`)

			const entries = yield* Effect.gen(function* () {
				const log = yield* EventLog
				return yield* Stream.runCollect(log.entries())
			}).pipe(Effect.provide(layerJsonl(filePath)))

			const seqs = Array.from(entries).map((entry) => entry.seq)
			expect(seqs.length).toBe(5)
			expect(new Set(seqs).size, `duplicate seq in ${seqs.join(',')}`).toBe(seqs.length)
			for (const [index, seq] of seqs.entries()) {
				if (index > 0) expect(seq, `at ${index} in ${seqs.join(',')}`).toBeGreaterThan(seqs[index - 1] ?? -1)
			}
		}),
	).pipe(Effect.provide(NodeFileSystem.layer)),
)

/**
 * Reopening a seamed log repeatedly must stay stable: each cycle reads, appends,
 * and never reuses a sequence already on disk. A one-shot check would not catch
 * a repair that drifts.
 */
it.effect('jsonl layer stays stable across repeated reopens of a seamed log', () =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'fold-event-log-' })
			const filePath = join(dir, 'reopened.jsonl')

			yield* Effect.gen(function* () {
				const log = yield* EventLog
				yield* log.append(makeSessionStarted('/tmp/one'))
				for (const value of [1, 2]) yield* log.append(makeToolState(value))
			}).pipe(Effect.provide(layerJsonl(filePath)))

			// Force a backwards seam: 0, 1, 0.
			const lines = (yield* fs.readFileString(filePath)).split('\n').filter((l) => l.length > 0)
			const seamed = lines
				.map((line, index) => JSON.stringify({ ...JSON.parse(line), seq: [0, 1, 0][index] ?? index }))
				.join('\n')
			yield* fs.writeFileString(filePath, `${seamed}\n`)

			for (let cycle = 0; cycle < 3; cycle += 1) {
				yield* Effect.gen(function* () {
					const log = yield* EventLog
					yield* log.append(makeToolState(cycle))
				}).pipe(Effect.provide(layerJsonl(filePath)))
			}

			const onDisk = (yield* fs.readFileString(filePath))
				.split('\n')
				.filter((line) => line.length > 0)
				.map((line): number => JSON.parse(line).seq)
			// The appended tail never repeats a sequence already written.
			const tail = onDisk.slice(3)
			expect(new Set(tail).size, `repeat in appended tail ${tail.join(',')}`).toBe(tail.length)
			for (const seq of tail) expect(onDisk.slice(0, 3)).not.toContain(seq)

			const entries = yield* Effect.gen(function* () {
				const log = yield* EventLog
				return yield* Stream.runCollect(log.entries())
			}).pipe(Effect.provide(layerJsonl(filePath)))
			const seqs = Array.from(entries).map((entry) => entry.seq)
			for (const [index, seq] of seqs.entries()) {
				if (index > 0) expect(seq, `at ${index} in ${seqs.join(',')}`).toBeGreaterThan(seqs[index - 1] ?? -1)
			}
		}),
	).pipe(Effect.provide(NodeFileSystem.layer)),
)

/**
 * The writer half. Appending after reopening a gapped log must not reuse a
 * sequence already on disk, which is what `current.length` did.
 */
it.effect('jsonl layer appends past the newest sequence, not the entry count', () =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'fold-event-log-' })
			const filePath = join(dir, 'resumed.jsonl')

			yield* Effect.gen(function* () {
				const log = yield* EventLog
				yield* log.append(makeSessionStarted('/tmp/one'))
				yield* log.append(makeToolState(1))
			}).pipe(Effect.provide(layerJsonl(filePath)))

			const [first, second] = (yield* fs.readFileString(filePath)).split('\n').filter((l) => l.length > 0)
			const jumped = JSON.stringify({ ...JSON.parse(second ?? '{}'), seq: 41 })
			yield* fs.writeFileString(filePath, `${first}\n${jumped}\n`)

			const appended = yield* Effect.gen(function* () {
				const log = yield* EventLog
				return yield* log.append(makeToolState(2))
			}).pipe(Effect.provide(layerJsonl(filePath)))

			expect(appended.seq).toBe(42)

			// And the file it just wrote is readable again.
			const reread = yield* Effect.gen(function* () {
				const log = yield* EventLog
				return yield* Stream.runCollect(log.entries())
			}).pipe(Effect.provide(layerJsonl(filePath)))
			expect(Array.from(reread).map((entry) => entry.seq)).toEqual([0, 41, 42])
		}),
	).pipe(Effect.provide(NodeFileSystem.layer)),
)

it.effect('jsonl layer replays assistant usage when cache fields are absent', () =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'fold-event-log-' })
			const filePath = join(dir, 'usage.jsonl')
			const agentId = AgentId.create()
			const line = JSON.stringify({
				_tag: 'assistant-message',
				seq: 0,
				ts: 1,
				agentId,
				parentAgentId: null,
				toolCallId: null,
				messageId: MessageId.create(),
				message: { options: {}, role: 'assistant', content: 'done' },
				finish: {
					reason: 'stop',
					usage: {
						inputTokens: { uncached: 10, total: 10, cacheRead: 0 },
						outputTokens: { total: 2 },
					},
				},
			})

			yield* fs.writeFileString(filePath, `${line}\n`)

			const entries = yield* Effect.gen(function* () {
				const log = yield* EventLog
				return yield* Stream.runCollect(log.entries())
			}).pipe(Effect.provide(layerJsonl(filePath)))
			const entry = entries[0]

			expect(entry?._tag).toBe('assistant-message')
			if (entry?._tag !== 'assistant-message') return
			expect(entry.finish?.usage.inputTokens?.cacheWrite).toBeUndefined()
			expect(entry.finish?.usage.inputTokens?.cacheRead).toBe(0)
			expect(entry.finish?.usage.outputTokens?.total).toBe(2)
		}),
	).pipe(Effect.provide(NodeFileSystem.layer)),
)

it.effect('jsonl subscribe replays and follows live appends', () =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'fold-event-log-' })
			const filePath = join(dir, 'subscribe.jsonl')

			const result = yield* Effect.gen(function* () {
				const log = yield* EventLog
				yield* log.append(makeSessionStarted('/tmp/one'))

				const fiber = yield* Stream.runCollect(log.subscribe(0).pipe(Stream.take(2))).pipe(Effect.forkChild)
				yield* log.append(makeSessionStarted('/tmp/two'))

				return yield* Fiber.join(fiber)
			}).pipe(Effect.provide(layerJsonl(filePath)))

			expect(result.map((entry) => entry.seq)).toEqual([0, 1])
		}),
	).pipe(Effect.provide(NodeFileSystem.layer)),
)
