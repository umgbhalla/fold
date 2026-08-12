import { homedir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'

import { fileSystemFor } from '../Fs/DefaultFileSystem'
import { type SessionLayoutOptions } from './SessionLayout'

/**
 * Parked prompt drafts, on disk.
 *
 * Shared across sessions rather than scoped to one, because the thing a user
 * parks is usually the thing they want in a different session: "not this one,
 * the other one" is the common case, and a per-session stash cannot serve it.
 *
 * Failures are swallowed the same way viewed-changes failures are. A stash is
 * a convenience, and an unwritable state directory should cost the user a
 * parked draft, never their turn.
 */
/**
 * Above the per-project sessions directory, not inside it.
 *
 * `sessionsDirFor` is scoped to a project slug, which would give each checkout
 * its own stash and defeat the point: what a user parks is usually what they
 * want somewhere else.
 */
const stashDir = (options?: SessionLayoutOptions): string => options?.foldHome ?? join(homedir(), '.fold')
const stashPath = (options?: SessionLayoutOptions): string => join(stashDir(options), 'prompt-stash.jsonl')

export const readPromptStash = (options?: SessionLayoutOptions): Effect.Effect<string> => {
	const fs = fileSystemFor(options?.fileSystem === undefined ? {} : { fileSystem: options.fileSystem })
	return fs.readFileString(stashPath(options)).pipe(Effect.catch(() => Effect.succeed('')))
}

/**
 * Rewrite the whole stash.
 *
 * An append would be cheaper, but the stash is edited as well as added to: a
 * pop removes an entry, and appends cannot express a removal. It is at most a
 * couple of dozen short lines.
 */
export const writePromptStash = (contents: string, options?: SessionLayoutOptions): Effect.Effect<void> => {
	const fs = fileSystemFor(options?.fileSystem === undefined ? {} : { fileSystem: options.fileSystem })
	const directory = stashDir(options)
	return fs.makeDirectory(directory, { recursive: true }).pipe(
		Effect.andThen(fs.writeFileString(stashPath(options), contents)),
		Effect.catch(() => Effect.void),
	)
}
