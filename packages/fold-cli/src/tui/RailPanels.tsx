/** @jsxImportSource @opentui/solid */
import { Index, Show } from 'solid-js'

import type { GitChange } from './GitChanges'
import { renderRow } from './RowLayout'
import { theme } from './ThemeState'

/**
 * The rail's read-only sections.
 *
 * These exist so the rail has more than two things in it, which is what makes
 * recency-driven collapsing worth having: with two sections there is nothing to
 * decay. They are deliberately summaries rather than editors. The full-screen
 * provider page and the model picker already do the editing, and duplicating
 * them in a 44-column column would be a worse version of both.
 */

/** Changed files, grouped the way git thinks of them. */
export const ChangesSection = (props: {
	readonly changes: ReadonlyArray<GitChange>
	readonly width: number
	readonly onSelect?: (change: GitChange) => void
}) => (
	<box flexDirection="column" flexGrow={1} paddingLeft={1}>
		<Show when={props.changes.length > 0} fallback={<text fg={theme.color.textFaint}>WORKTREE CLEAN</text>}>
			<Index each={props.changes}>
				{(change) => (
					<text wrapMode="none" onMouseDown={() => props.onSelect?.(change())}>
						{renderRow(
							[
								{ text: change().status, weight: 'required', minWidth: 2 },
								{ text: change().path, weight: 'subject', minWidth: 8 },
								{ text: `+${change().additions}`, weight: 'optional', minWidth: 3 },
								{ text: `-${change().deletions}`, weight: 'optional', minWidth: 3 },
							],
							Math.max(0, props.width - 1),
						)}
					</text>
				)}
			</Index>
		</Show>
	</box>
)

export type ProviderSummary = {
	readonly name: string
	readonly models: ReadonlyArray<unknown>
}

/** Which providers are configured, and how many models each offers. */
export const ModelsSection = (props: {
	readonly providers: ReadonlyArray<ProviderSummary>
	readonly current: string
	readonly width: number
}) => (
	<box flexDirection="column" flexGrow={1} paddingLeft={1}>
		<text fg={theme.color.textFaint} wrapMode="none">
			IN USE
		</text>
		<text fg={theme.color.coreBright} wrapMode="none" truncate>
			{props.current}
		</text>
		<box height={1} />
		<Show
			when={props.providers.length > 0}
			fallback={<text fg={theme.color.textFaint}>NO PROVIDERS CONFIGURED</text>}
		>
			<Index each={props.providers}>
				{(provider) => (
					<text wrapMode="none">
						{renderRow(
							[
								{ text: provider().name, weight: 'subject', minWidth: 6 },
								{ text: String(provider().models.length), weight: 'required', minWidth: 2 },
							],
							Math.max(0, props.width - 1),
						)}
					</text>
				)}
			</Index>
		</Show>
	</box>
)

/**
 * What this session is configured as.
 *
 * The values here are the ones that change what the next turn does, which is a
 * narrower set than the config file holds: a rail section that mirrored the
 * whole file would be a worse file viewer.
 */
export const SettingsSection = (props: {
	readonly cwd: string
	readonly mode: string
	readonly profile: string
	readonly model: string
	readonly reasoning: string
	readonly width: number
	readonly onOpenProviders?: () => void
}) => {
	const row = (label: string, value: string) => (
		<text wrapMode="none">
			{renderRow(
				[
					{ text: label, weight: 'required', minWidth: 5 },
					{ text: value, weight: 'subject', minWidth: 6 },
				],
				Math.max(0, props.width - 1),
			)}
		</text>
	)
	return (
		<box flexDirection="column" flexGrow={1} paddingLeft={1}>
			{row('cwd', props.cwd)}
			{row('mode', props.mode)}
			{row('prof', props.profile)}
			{row('model', props.model)}
			{row('think', props.reasoning)}
			<box height={1} />
			<text fg={theme.color.textFaint} wrapMode="none" onMouseDown={() => props.onOpenProviders?.()}>
				^K FOR COMMANDS
			</text>
		</box>
	)
}
