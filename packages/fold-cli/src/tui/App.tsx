/** @jsxImportSource @opentui/solid */
import type { ModelConfiguration } from '@humanlayer/fold-agent'
import { AgentId, defaultContextWindowFor } from '@humanlayer/fold-core'
import type { ModelCatalogEntry } from '@humanlayer/fold-core'
import { installPostFx, nextVignetteMode, type FxToggles } from '@humanlayer/fold-tui-theme/postfx'
import { TextAttributes, type KeyEvent, type ScrollBoxRenderable, type TextareaRenderable } from '@opentui/core'
import { registerManagedTextareaLayer } from '@opentui/keymap/addons/opentui'
import { createDefaultOpenTuiKeymap } from '@opentui/keymap/opentui'
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/solid'
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Index,
	Match,
	on,
	onCleanup,
	Show,
	Switch,
	type Accessor,
} from 'solid-js'

import { agentTypeAccent } from './AccentPalette'
import { ActivityIndicator, type ActivityState } from './ActivityIndicator'
import { CommandPalette, type TuiCommand } from './CommandPalette'
import { nextRootInputVerb, normalizeRootInputVerb, rootInputVerbLabel, type RootInputVerb } from './Converse'
import { EventDetail, EventIndexRow, EventRow, rowVisual } from './EventViews'
import type { GitChange, GitChangeGroup, GitSnapshot } from './GitChanges'
import { metaBarRows, metaDensity } from './MetaDensity'
import { ModelSelectionModal, type ModelSelectionRequest } from './ModelSelectionModal'
import {
	contextMode,
	followLive,
	initialNavigationState,
	jumpSelection,
	moveSelection,
	movePane,
	reconcilePane,
	reconcileSelection,
	type NavigationState,
} from './Navigation'
import { NewSessionModal } from './NewSessionModal'
import type { NewSessionRequest } from './NewSessionModal'
import { paneWidths, railInnerWidth, type FocusedPane, type PaneWidths } from './PaneLayout'
import { PaneSpine } from './PaneSpine'
import { stackLayout, type CollapsePolicy, type PaneRenderMode } from './PaneStack'
import { ChangesSection, ModelsSection, SettingsSection } from './RailPanels'
import { railSectionsFor, type RailSectionId } from './RailRegistry'
import { railSections } from './RailSections'
import { renderRow, type RowCell } from './RowLayout'
import { agentTypeLine, sessionScalarsLine, toolGlyph, toolTallyLine } from './SessionScalars'
import {
	conversationRows,
	durableConversationRows,
	allEntriesSignature,
	durableRowsSignature,
	makeSessionStateFromEntries,
	replayIsReady,
	transientConversationRows,
	type ConversationRow,
	type SessionState,
} from './SessionState'
import { SkillsRail } from './SkillsRail'
import { SubagentRow } from './SubagentRow'
import { metaCounts, skillViews, subagentViews, type SubagentView } from './Subagents'
import { theme as tactical } from './ThemeState'
import { TUI_CONTEXT_TITLE, TUI_INSPECT_BADGE, TUI_LIVE_BADGE, tuiScrollbarOptions } from './TuiChrome'
import { createFxControls, FxFooter, fxCommands, KeyHint } from './TuiControls'
import { prepareTuiKeyboard } from './TuiKeymap'
import { isChangeViewed, type ViewedPatchHashes } from './ViewedChanges'

export type TuiAppProps = {
	readonly state: Accessor<SessionState>
	readonly cwd: string
	readonly sessionId: string
	readonly mode: string
	readonly profile: string
	readonly configuration?: ModelConfiguration
	/** Pricing and limits for the live model, so the rail can show cost and window use. */
	readonly catalog?: ReadonlyArray<ModelCatalogEntry>
	readonly notice: Accessor<string | null>
	readonly targetNotice?: Accessor<{ readonly agentId: string; readonly text: string } | null>
	readonly compacting?: Accessor<boolean>
	readonly initialInputFocused?: boolean
	readonly onSubmit: (verb: RootInputVerb, text: string) => void
	readonly onCompact: () => void
	readonly onInterrupt: () => void
	readonly onNewSession?: (request: NewSessionRequest) => void
	readonly onConfigureModels?: (selection: ModelSelectionRequest) => void
	readonly onOpenProviders?: () => void
	readonly onBackToSessions?: () => void
	readonly onCopySessionId?: () => void
	readonly toggles?: Accessor<FxToggles>
	readonly setToggles?: (update: (current: FxToggles) => FxToggles) => void
	readonly onStop?: () => void
	readonly onTargetSubmit?: (agentId: string, text: string, verb: RootInputVerb) => void
	readonly onTargetInterrupt?: (agentId: string) => void
	readonly onInjectSkill?: (skill: string, agentId: string | null) => void
	readonly initialSelectedAgentId?: string
	readonly gitSnapshot?: Accessor<GitSnapshot>
	readonly viewedPatchHashes?: Accessor<ViewedPatchHashes>
	readonly onViewChange?: (change: GitChange) => void
	readonly onRefreshGit?: () => void
}

const changeGroups: ReadonlyArray<{ readonly id: GitChangeGroup; readonly label: string }> = [
	{ id: 'staged', label: 'STAGED' },
	{ id: 'unstaged', label: 'UNSTAGED' },
	{ id: 'untracked', label: 'UNTRACKED' },
]

const diffHeight = (diff: string): number => Math.max(4, diff.split('\n').length + 1)

/**
 * Stand-in root agent for a log that has not produced its first entry yet.
 * `AgentId.make` throws on a malformed id, so this has to be a well-formed one:
 * a short label like `agent_root` fails the cuid check and takes the whole TUI
 * down on the first render of an empty session.
 */
const placeholderRootAgentId = AgentId.make('agent_r00tr00tr00tr00tr00tr00t')

export const TuiApp = (props: TuiAppProps) => {
	const renderer = useRenderer()
	const dimensions = useTerminalDimensions()
	const [draft, setDraft] = createSignal('')
	const [paletteOpen, setPaletteOpen] = createSignal(false)
	const [newSessionOpen, setNewSessionOpen] = createSignal(false)
	const [modelsOpen, setModelsOpen] = createSignal(false)
	// Both rail tabs are navigable, so J/K always does something. META is gone:
	// its scalars are in the header and its histograms are the tally line.
	const [railTab, setRailTab] = createSignal<RailSectionId>('subagents')
	/**
	 * When each rail section was last opened, as a counter rather than a clock.
	 * The recency model only compares these, and a counter cannot drift or tie.
	 */
	const [touchClock, setTouchClock] = createSignal(5)
	const [touched, setTouched] = createSignal<Record<RailSectionId, number>>({
		subagents: 5,
		skills: 4,
		changes: 3,
		models: 2,
		settings: 1,
	})
	const touchSection = (id: RailSectionId): void => {
		const next = touchClock() + 1
		setTouchClock(next)
		setTouched((current) => ({ ...current, [id]: next }))
	}
	const [leftTab, setLeftTab] = createSignal<'events' | 'changes'>('events')
	const [selectedChange, setSelectedChange] = createSignal(0)
	const [expandedChanges, setExpandedChanges] = createSignal<ReadonlySet<string>>(new Set())
	const [selectedAgentId, setSelectedAgentId] = createSignal<string | null>(props.initialSelectedAgentId ?? null)
	const [targetDraft, setTargetDraft] = createSignal('')
	const [targetFocused, setTargetFocused] = createSignal(false)
	const [targetVerb, setTargetVerb] = createSignal<RootInputVerb>('send')
	const [selectedSkill, setSelectedSkill] = createSignal(0)
	const [confirmSkill, setConfirmSkill] = createSignal<string | null>(null)
	const { toggles, setToggles } = createFxControls(props.toggles, props.setToggles)
	const [inputFocused, setInputFocused] = createSignal(props.initialInputFocused === true)
	const [verb, setVerb] = createSignal<RootInputVerb>('send')
	const [now, setNow] = createSignal(Date.now())
	const relativeTimeTimer = setInterval(() => setNow(Date.now()), 30_000)
	const [navigation, setNavigation] = createSignal<NavigationState>(
		props.initialInputFocused === true ? { ...initialNavigationState, level: 'input' } : initialNavigationState,
	)
	let editor: TextareaRenderable | undefined
	let targetEditor: TextareaRenderable | undefined
	let eventsScroller: ScrollBoxRenderable | undefined
	let contextScroller: ScrollBoxRenderable | undefined
	let changesScroller: ScrollBoxRenderable | undefined
	let subagentsScroller: ScrollBoxRenderable | undefined
	let pendingG = false
	let observedMutationKey: number | null | undefined
	prepareTuiKeyboard(renderer)
	const keymap = createDefaultOpenTuiKeymap(renderer)
	const removeInputKeymap = registerManagedTextareaLayer(keymap, renderer, {
		enabled: () => inputFocused() && renderer.currentFocusedEditor === editor,
		bindings: [
			{ key: 'return', cmd: 'input.submit' },
			{ key: 'shift+return', cmd: 'input.newline' },
			{ key: 'ctrl+return', cmd: 'input.newline' },
			{ key: 'alt+return', cmd: 'input.newline' },
			{ key: 'ctrl+j', cmd: 'input.newline' },
		],
	})
	const removeTargetInputKeymap = registerManagedTextareaLayer(keymap, renderer, {
		enabled: () => targetFocused() && renderer.currentFocusedEditor === targetEditor,
		bindings: [
			{ key: 'return', cmd: 'input.submit' },
			{ key: 'shift+return', cmd: 'input.newline' },
			{ key: 'ctrl+return', cmd: 'input.newline' },
			{ key: 'alt+return', cmd: 'input.newline' },
			{ key: 'ctrl+j', cmd: 'input.newline' },
		],
	})
	onCleanup(removeInputKeymap)
	onCleanup(removeTargetInputKeymap)
	onCleanup(() => clearInterval(relativeTimeTimer))
	/**
	 * Split so a token delta only rebuilds the streaming tail. The durable half
	 * recomputes when the log grows, not on every 16 ms batch.
	 */
	const durableRows = createMemo(
		on(
			() => durableRowsSignature(props.state()),
			() => durableConversationRows(props.state()),
		),
	)
	const transientRows = createMemo(() => transientConversationRows(props.state()))
	const rows = createMemo(() => [...durableRows(), ...transientRows()])
	const gitSnapshot = createMemo<GitSnapshot>(() => props.gitSnapshot?.() ?? { _tag: 'ready', files: [] })
	const changes = createMemo(() => {
		const snapshot = gitSnapshot()
		return snapshot._tag === 'ready' ? snapshot.files : []
	})
	const gitSnapshotMessage = createMemo(() => {
		const snapshot = gitSnapshot()
		return snapshot._tag === 'ready' ? '' : snapshot.message
	})
	const currentChange = createMemo(() => changes()[selectedChange()])
	const selectChange = (index: number): void => {
		const next = Math.max(0, Math.min(changes().length - 1, index))
		setSelectedChange(next)
		const change = changes()[next]
		if (change !== undefined) props.onViewChange?.(change)
	}
	const logSignature = createMemo(() => allEntriesSignature(props.state()))
	/**
	 * Gated like the projections below: a session with no `session_started`
	 * entry falls through to a full scan, and that would run per token.
	 */
	const rootAgentId = createMemo(
		on(logSignature, () => {
			return (
				props.state().allEntries.find((entry) => entry._tag === 'session_started')?.rootAgentId ??
				props.state().allEntries[0]?.agentId ??
				placeholderRootAgentId
			)
		}),
	)
	/**
	 * Whole-log projections, rebuilt when the log grows rather than on every
	 * streaming token. `allEntries` is reconciled in place, so a delta batch
	 * leaves its identity changed but its content the same; keying on the
	 * signature is what stops a token from rescanning every entry for the rail,
	 * the header scalars and the tool tally at once.
	 */
	const agents = createMemo(
		on(
			() => [logSignature(), rootAgentId()] as const,
			() => subagentViews(props.state().allEntries, rootAgentId()),
		),
	)
	const selectedAgent = createMemo(() => agents().find((agent) => agent.agentId === selectedAgentId()))
	const catalogEntry = createMemo(() => {
		const modelId = props.state().model
		const catalog = props.catalog
		if (catalog === undefined || modelId === 'unresolved') return null
		return catalog.find((entry) => entry.modelId === modelId) ?? null
	})
	const meta = createMemo(
		on(
			() => [logSignature(), agents(), catalogEntry(), props.state().model] as const,
			() =>
				metaCounts(
					props.state().allEntries,
					agents(),
					catalogEntry()?.pricing ?? null,
					catalogEntry()?.contextWindow ?? defaultContextWindowFor(props.state().model),
				),
		),
	)
	const skillTargetAgent = createMemo(() => selectedAgent())
	const skills = createMemo(
		on(
			() => [logSignature(), skillTargetAgent()?.agentId ?? rootAgentId()] as const,
			([, agentId]) => skillViews(props.state().allEntries, agentId),
		),
	)
	/** The sections this session actually has, in recency order. */
	const activeSections = createMemo(() =>
		railSectionsFor({
			agents: agents(),
			skills: skills(),
			changes: changes(),
			configuration: props.configuration,
			touched: touched(),
		}),
	)
	/** Their detail level for the rail's current height. */
	const sectionViews = createMemo(() => railSections(activeSections(), Math.max(0, dimensions().height - 10)))
	const selectRailSection = (id: RailSectionId): void => {
		setRailTab(id)
		touchSection(id)
	}
	const nextRailTab = (): void => {
		const ids = activeSections().map((section) => section.id)
		const index = ids.indexOf(railTab())
		const next = ids[(index + 1) % Math.max(1, ids.length)]
		if (next !== undefined) selectRailSection(next)
	}
	/**
	 * The key of the newest row, as a memo of its own.
	 *
	 * Every row's `selected` accessor needs to know whether it is the live tail.
	 * Reading `rows()` for that made each of the N rows a subscriber of the row
	 * list, so one streamed token invalidated all of them and repainted the whole
	 * transcript instead of the one line that grew. The key of the streaming row
	 * does not change while its text does, so a memo over just the key settles to
	 * the same string and stops the invalidation at the boundary.
	 */
	const lastRowKey = createMemo(() => rows().at(-1)?.key)
	const rowKeys = createMemo(() => rows().map((row) => row.key))
	const mode = createMemo(() => contextMode(navigation(), rowKeys()))
	const readerMode = createMemo(() => (leftTab() === 'changes' ? 'inspect' : mode()))
	const selectedRow = createMemo(() => {
		const selectedKey = navigation().selectedKey
		return selectedKey === null ? undefined : rows().find((row) => row.key === selectedKey)
	})
	const eventSelectedAgent = createMemo(() => {
		const toolCallId = selectedRow()?.toolCallId
		return toolCallId === null || toolCallId === undefined
			? undefined
			: agents().find((agent) =>
					agent.entries.some((entry) => entry._tag === 'agent_started' && entry.toolCallId === toolCallId),
				)
	})
	const focusedAgent = createMemo(() =>
		leftTab() === 'changes' ? undefined : (selectedAgent() ?? eventSelectedAgent()),
	)
	const targetStatus = createMemo<SessionState['status']>(() =>
		focusedAgent()?.status === 'running' ? 'RUNNING' : 'IDLE',
	)
	const targetVerbLabel = createMemo(() =>
		focusedAgent()?.status === 'running' ? rootInputVerbLabel(targetVerb()) : 'RESUME',
	)
	/**
	 * A focused subagent's rows are rebuilt from its own entries, which is the
	 * most expensive projection in the TUI. The cache keys on the agent and its
	 * entry count so a 16 ms delta batch that changed nothing in that agent
	 * reuses the previous rows instead of replaying its whole log.
	 */
	let agentRowsCache: {
		readonly agentId: string
		readonly count: number
		readonly rows: ReadonlyArray<ConversationRow>
	} | null = null
	const agentRows = (agent: SubagentView): ReadonlyArray<ConversationRow> => {
		const cached = agentRowsCache
		// The store is written with `reconcile`, which patches arrays in place, so
		// the entry count - not array identity - is what says the log moved.
		if (cached !== null && cached.agentId === agent.agentId && cached.count === agent.entries.length)
			return cached.rows
		const next = conversationRows(makeSessionStateFromEntries(agent.entries, agent.agentId))
		agentRowsCache = { agentId: agent.agentId, count: agent.entries.length, rows: next }
		return next
	}
	const visibleContextRows = createMemo(() => {
		const agent = focusedAgent()
		if (agent !== undefined) return agentRows(agent)
		const selected = selectedRow()
		return mode() === 'inspect' && selected !== undefined ? [selected] : rows()
	})
	/**
	 * The pane the user is in, in layout terms. Navigation calls the rail
	 * `subagents`; the layout calls its slot `rail`.
	 */
	const focusedPane = createMemo<FocusedPane>(() => {
		switch (navigation().pane) {
			case 'events':
				return 'events'
			case 'context':
				return 'context'
			case 'subagents':
				return 'rail'
		}
	})
	const spreadPanes = createMemo(() => paneWidths(dimensions().width, agents().length, focusedPane()))
	/**
	 * Stack mode: unfocused panes collapse to a labelled spine so the focused one
	 * gets the screen, rather than every pane staying legible and the one you are
	 * reading getting a third of the terminal.
	 */
	const [stackMode, setStackMode] = createSignal<CollapsePolicy>('none')
	const stackSlots = createMemo(() =>
		stackLayout(
			dimensions().width,
			(['events', 'context', 'rail'] as const).filter((id) => spreadPanes()[id] > 0),
			focusedPane(),
			stackMode(),
			spreadPanes(),
		),
	)
	const slotFor = (id: 'events' | 'context' | 'rail') => stackSlots().find((slot) => slot.id === id)
	const paneMode = (id: 'events' | 'context' | 'rail'): PaneRenderMode => slotFor(id)?.mode ?? 'full'
	const panes = createMemo<PaneWidths>(() => {
		if (stackMode() === 'none') return spreadPanes()
		const slots = stackSlots()
		const width = (id: 'events' | 'context' | 'rail'): number => slots.find((slot) => slot.id === id)?.width ?? 0
		return { events: width('events'), context: width('context'), rail: width('rail') }
	})
	/**
	 * The fleet tally in the rail's tab bar: running, done, failed. This was the
	 * RUN row of the STATUS panel, which is worth a slot in a bar that is already
	 * there but not a bordered panel of its own.
	 */
	const railRunLabel = createMemo(() => {
		const { running, done, errors } = meta()
		const parts = [running > 0 ? `● ${running}` : '', done > 0 ? `◆ ${done}` : '', errors > 0 ? `✕ ${errors}` : '']
		const label = parts.filter((part) => part !== '').join(' ')
		return label === '' ? '' : label
	})
	const scalarsLine = createMemo(() =>
		sessionScalarsLine({
			contextTokens: meta().contextTokens,
			contextPercent: meta().contextPercent,
			costUsd: meta().costUsd,
			turns: meta().turns,
			agents: meta().agents,
		}),
	)
	const eventPaneWidth = createMemo(() => panes().events)
	const railPaneWidth = createMemo(() => panes().rail)
	const railInner = createMemo(() => railInnerWidth(panes().rail))
	// The tally box is indented one column, so it renders into one less than the pane's inner width.
	const toolTally = createMemo(() => toolTallyLine(meta().toolCalls, toolGlyph, Math.max(0, railInner() - 1)))
	const agentTypes = createMemo(() => agentTypeLine(meta().agentTypes, Math.max(0, railInner() - 1)))
	/**
	 * The expanded form of the two tallies, shown only when the rail is focused.
	 * Capped at a handful of rows each so the lists never push the subagent list
	 * they are describing off the screen.
	 */
	const agentTypeBars = createMemo(() => metaBarRows(meta().agentTypes, Math.max(0, railInner() - 3), 5))
	const toolBars = createMemo(() => metaBarRows(meta().toolCalls, Math.max(0, railInner() - 5), 6))
	const contextPaneWidth = createMemo(() => panes().context)
	/**
	 * The panes actually on screen, left to right, so `h`/`l` cannot walk into the
	 * rail while it is collapsed.
	 */
	const availablePanes = createMemo<ReadonlyArray<NavigationState['pane']>>(() =>
		panes().rail > 0 ? ['events', 'context', 'subagents'] : ['events', 'context'],
	)
	const verboseFooter = createMemo(() => dimensions().width >= 160)
	const verbLabel = createMemo(() => rootInputVerbLabel(verb()))
	const isCompacting = createMemo(() => props.compacting?.() === true)
	const sessionActivity = createMemo<ActivityState>(() =>
		isCompacting()
			? 'compacting'
			: props.state().status === 'RUNNING' || meta().running > 0
				? 'running'
				: props.state().status === 'ERROR'
					? 'error'
					: props.state().status === 'STOPPED'
						? 'stopped'
						: 'ready',
	)
	const runningCount = createMemo(() => meta().running + (props.state().status === 'RUNNING' ? 1 : 0))
	const sessionActivityLabel = createMemo(() => {
		if (sessionActivity() === 'running') return runningCount() > 1 ? `${runningCount()} RUNNING` : 'RUNNING'
		return sessionActivity().toUpperCase()
	})
	const reasoningLabel = createMemo(() => {
		const level = props.state().reasoningLevel
		return level === null ? '' : ` · ${level.toUpperCase()}`
	})
	const paletteCommands = createMemo<ReadonlyArray<TuiCommand>>(() => {
		const fx = fxCommands({ toggles, setToggles })
		const commands: Array<TuiCommand> = [
			{
				id: 'new',
				title: 'New session',
				category: 'NAVIGATE',
				shortcut: '^N',
				run: () => setNewSessionOpen(true),
			},
			{ id: 'resume', title: 'Resume session…', category: 'NAVIGATE', run: () => props.onBackToSessions?.() },
			{ id: 'back', title: 'Return to sessions', category: 'NAVIGATE', run: () => props.onBackToSessions?.() },
			{ id: 'copy', title: 'Copy session ID', category: 'SESSION', run: () => props.onCopySessionId?.() },
			{
				id: 'providers-info',
				title: 'Providers / Auth...',
				category: 'APPLICATION',
				run: () => props.onOpenProviders?.(),
			},
			{
				id: 'models',
				title: 'Configure models, modes, and providers...',
				category: 'APPLICATION',
				children: [
					{
						id: 'select-model',
						title: 'Switch model, profile, or mode...',
						category: 'SESSION',
						run: () => setModelsOpen(true),
					},
					{
						id: 'modes-info',
						title: 'Switch current mode via model selection...',
						category: 'APPLICATION',
						run: () => setNewSessionOpen(true),
					},
				],
			},
			{
				id: 'changes',
				title: leftTab() === 'changes' ? 'Show events' : 'Show changes',
				category: 'NAVIGATE',
				shortcut: 'D',
				run: () => toggleChanges(),
			},
			...(leftTab() === 'changes'
				? [
						{
							id: 'refresh-changes',
							title: 'Refresh changes',
							category: 'VIEW' as const,
							run: () => props.onRefreshGit?.(),
						},
					]
				: []),
			...fx.slice(0, 4),
			fx[4],
			{ id: 'quit', title: 'Quit Fold', category: 'APPLICATION', shortcut: 'Q', run: () => renderer.destroy() },
		]
		if (props.state().status === 'RUNNING') {
			commands.push({ id: 'stop', title: 'Stop gracefully', category: 'SESSION', run: () => props.onStop?.() })
			commands.push({
				id: 'interrupt',
				title: 'Interrupt all',
				category: 'SESSION',
				shortcut: '^C',
				run: props.onInterrupt,
			})
		} else if (!isCompacting()) {
			commands.push({ id: 'compact', title: 'Compact now', category: 'SESSION', run: props.onCompact })
		}
		return commands
	})
	const paneState = (pane: NavigationState['pane']): 'inactive' | 'selected' | 'focused' => {
		if (navigation().pane !== pane) return 'inactive'
		return navigation().level === 'pane' ? 'selected' : 'focused'
	}
	const paneBorderColor = (pane: NavigationState['pane']): string => {
		const state = paneState(pane)
		return state === 'inactive' ? tactical.chrome.border : tactical.color.coreBright
	}
	const paneTitleColor = (pane: NavigationState['pane']): string =>
		paneState(pane) === 'focused'
			? tactical.color.coreBright
			: paneState(pane) === 'selected'
				? tactical.color.coreBright
				: tactical.color.textDim
	const paneTitle = (pane: NavigationState['pane'], label: string, maxWidth?: number): string => {
		const state = paneState(pane)
		const prefix = state === 'focused' ? ' ◆ ' : state === 'selected' ? ' ▸ ' : ' '
		const suffix = state === 'focused' ? ' · [FOCUSED] ' : state === 'selected' ? ' · [SELECTED] ' : ' '
		const available = maxWidth === undefined ? label.length : Math.max(1, maxWidth - prefix.length - suffix.length)
		const fittedLabel =
			label.length <= available ? label : available === 1 ? '…' : `${label.slice(0, available - 1).trimEnd()}…`
		return `${prefix}${fittedLabel}${suffix}`
	}
	const contextSubject = createMemo(() => {
		if (leftTab() === 'changes') return `git · ${changes().length} files`
		const selected = selectedRow()
		const agent = focusedAgent()
		if (agent !== undefined) return `${agent.type} · ${agent.description}`
		if (mode() === 'live' || selected === undefined) return 'root'
		const visual = rowVisual(selected)
		return `${selected.seq ?? 'live'} ${visual.glyph} ${selected.label.toLowerCase()}`
	})
	const toggleChanges = (): void => {
		setLeftTab((current) => {
			const next = current === 'events' ? 'changes' : 'events'
			if (next === 'changes') {
				setSelectedAgentId(null)
				setInputFocused(false)
				editor?.blur()
				props.onRefreshGit?.()
			}
			return next
		})
		setNavigation((current) => ({ ...current, pane: 'events', level: 'pane' }))
	}
	const submitDraft = (): void => {
		const text = (editor?.plainText ?? draft()).trim()
		if (text.length === 0) return
		if (text === '/compact') props.onCompact()
		else props.onSubmit(verb(), text)
		setNavigation(followLive)
		setDraft('')
		editor?.setText('')
		if (inputFocused()) editor?.focus()
	}
	const submitTargetDraft = (): void => {
		const value = (targetEditor?.plainText ?? targetDraft()).trim()
		const agent = focusedAgent()
		if (value.length === 0 || agent === undefined) return
		props.onTargetSubmit?.(agent.agentId, value, targetVerb())
		setTargetDraft('')
		targetEditor?.setText('')
		targetEditor?.focus()
	}
	const blurComposers = (): void => {
		setInputFocused(false)
		editor?.blur()
		setTargetFocused(false)
		targetEditor?.blur()
	}
	const moveWithinPane = (delta: -1 | 1): void => {
		if (navigation().pane === 'events') {
			if (leftTab() === 'changes') {
				selectChange(selectedChange() + delta)
			} else {
				setNavigation((current) => moveSelection(current, rowKeys(), delta))
			}
			return
		}
		if (navigation().pane === 'context') {
			contextScroller?.scrollBy(delta, 'step')
			return
		}
		if (railTab() === 'skills') {
			setSelectedSkill((current) => Math.max(0, Math.min(skills().length - 1, current + delta)))
			return
		}
		const available = agents()
		if (available.length === 0) return
		const current = available.findIndex((agent) => agent.agentId === selectedAgentId())
		const origin = current < 0 ? (delta === 1 ? -1 : available.length) : current
		const next = Math.max(0, Math.min(available.length - 1, origin + delta))
		const agent = available[next]
		if (agent !== undefined) setSelectedAgentId(agent.agentId)
	}
	const jumpWithinPane = (target: 'first' | 'last'): void => {
		if (navigation().pane === 'events') {
			if (leftTab() === 'changes') {
				selectChange(target === 'first' ? 0 : Math.max(0, changes().length - 1))
			} else {
				setNavigation((current) => jumpSelection(current, rowKeys(), target))
			}
			return
		}
		if (navigation().pane === 'context') {
			contextScroller?.scrollTo(target === 'first' ? 0 : contextScroller.scrollHeight)
			return
		}
		if (railTab() === 'skills') {
			setSelectedSkill(target === 'first' ? 0 : Math.max(0, skills().length - 1))
			return
		}
		const available = agents()
		const agent = target === 'first' ? available[0] : available.at(-1)
		if (agent !== undefined) setSelectedAgentId(agent.agentId)
	}
	const toggleCurrentChange = (): void => {
		const change = currentChange()
		if (change === undefined) return
		setExpandedChanges((current) => {
			const next = new Set(current)
			if (next.has(change.key)) next.delete(change.key)
			else next.add(change.key)
			return next
		})
	}
	const activateSelectedPane = (): void => {
		if (navigation().pane === 'events') {
			if (leftTab() === 'changes') {
				const change = currentChange()
				if (change !== undefined) props.onViewChange?.(change)
				toggleCurrentChange()
				return
			}
			const row = selectedRow() ?? rows().at(-1)
			if (row !== undefined) {
				setNavigation((current) => ({ ...current, selectedKey: row.key }))
				const agent = agents().find((candidate) =>
					candidate.entries.some(
						(entry) => entry._tag === 'agent_started' && entry.toolCallId === row.toolCallId,
					),
				)
				if (agent !== undefined) setSelectedAgentId(agent.agentId)
			}
			setNavigation((current) => ({ ...current, pane: 'context', level: 'pane' }))
			return
		}
		if (navigation().pane === 'subagents' && railTab() === 'skills') {
			const skill = skills()[selectedSkill()]
			if (skill !== undefined) setConfirmSkill(skill.name)
			return
		}
		const agent = focusedAgent()
		if (agent === undefined) return
		setNavigation((current) => ({ ...current, pane: 'context', level: 'pane' }))
	}
	const focusComposer = (): void => {
		const agent = navigation().pane === 'events' ? undefined : focusedAgent()
		if (agent !== undefined) {
			setTargetFocused(true)
			setNavigation((current) => ({ ...current, pane: 'context', level: 'input' }))
			targetEditor?.focus()
			return
		}
		if (leftTab() === 'changes') setLeftTab('events')
		setInputFocused(true)
		setNavigation((current) => ({ ...current, pane: 'events', level: 'input' }))
		editor?.focus()
	}

	createEffect(() => setVerb((current) => normalizeRootInputVerb(props.state().status, current)))
	createEffect(() => setTargetVerb((current) => normalizeRootInputVerb(targetStatus(), current)))
	createEffect(() => setNavigation((current) => reconcileSelection(current, rowKeys())))
	// The rail can vanish under the cursor, on a resize or when the last subagent
	// finishes, which would otherwise leave the active pane pointing at nothing.
	createEffect(() => setNavigation((current) => reconcilePane(current, availablePanes())))
	createEffect(() => {
		const selectedKey = navigation().selectedKey ?? rows().at(-1)?.key
		if (selectedKey !== undefined) eventsScroller?.scrollChildIntoView(`event:${selectedKey}`)
	})
	/**
	 * Keep the selected subagent row in view.
	 *
	 * Tracks the selected agent's entry count as well as which agent is selected:
	 * an expanded row grows from two lines to four the moment its tool starts, and
	 * a row selected at the bottom edge would otherwise push its own new detail
	 * lines below the viewport with nothing left to scroll them back.
	 */
	const selectedAgentEntryCount = createMemo(
		() => agents().find((agent) => agent.agentId === selectedAgentId())?.entries.length ?? 0,
	)
	createEffect(
		on([selectedAgentId, selectedAgentEntryCount], ([agentId]) => {
			if (agentId !== null) subagentsScroller?.scrollChildIntoView(`subagent:${agentId}`)
		}),
	)
	createEffect(() => {
		const files = changes()
		setSelectedChange((current) => Math.max(0, Math.min(files.length - 1, current)))
	})
	createEffect(() => {
		const change = currentChange()
		if (leftTab() === 'changes' && change !== undefined) {
			changesScroller?.scrollChildIntoView(`change:${change.key}`)
			contextScroller?.scrollChildIntoView(`diff:${change.key}`)
		}
	})
	createEffect(() => {
		const latest = props
			.state()
			.allEntries.toReversed()
			.find(
				(entry) =>
					entry._tag === 'tool-result' &&
					typeof entry.message.content !== 'string' &&
					entry.message.content.some(
						(part) =>
							part.type === 'tool-result' &&
							!part.isFailure &&
							(part.name === 'write' || part.name === 'edit' || part.name === 'apply_patch'),
					),
			)?.seq
		if (observedMutationKey === undefined) {
			observedMutationKey = latest ?? null
			return
		}
		if (latest !== undefined && latest !== observedMutationKey) {
			observedMutationKey = latest
			if (leftTab() === 'changes') props.onRefreshGit?.()
		}
	})

	createEffect(() => {
		renderer.setBackgroundColor(tactical.color.void)
		const removeFx = installPostFx(renderer, tactical, toggles())
		onCleanup(removeFx)
	})

	useKeyboard((key: KeyEvent) => {
		if (key.eventType === 'release') return
		if (paletteOpen() || newSessionOpen() || modelsOpen()) return
		if (confirmSkill() !== null) {
			key.preventDefault()
			if (key.name === 'y') {
				const skill = confirmSkill()
				if (skill !== null) props.onInjectSkill?.(skill, skillTargetAgent()?.agentId ?? null)
				setConfirmSkill(null)
			} else if (key.name === 'n' || key.name === 'escape') setConfirmSkill(null)
			return
		}
		if (key.ctrl && key.name === 'a') {
			key.preventDefault()
			const available = agents()
			if (available.length === 0) return
			const index = available.findIndex((agent) => agent.agentId === selectedAgentId())
			setSelectedAgentId(available[(index + 1) % available.length]?.agentId ?? null)
			return
		}
		if (key.ctrl && key.name === 'c') {
			key.preventDefault()
			const agent = focusedAgent()
			if (agent === undefined) props.onInterrupt()
			else if (agent.status === 'running') props.onTargetInterrupt?.(agent.agentId)
			return
		}
		if (key.ctrl && key.name === 'n') {
			key.preventDefault()
			setNewSessionOpen(true)
			return
		}
		if ((key.ctrl || key.meta) && key.name === 'k') {
			key.preventDefault()
			setPaletteOpen(true)
			return
		}
		if (targetFocused()) {
			if (key.name === 'escape') {
				key.preventDefault()
				setTargetFocused(false)
				targetEditor?.blur()
				setNavigation((current) => ({ ...current, pane: 'context', level: 'pane' }))
				return
			}
			if (key.name === 'enter' || key.name === 'return') {
				key.preventDefault()
				submitTargetDraft()
				return
			}
			if (key.name === 'tab' && key.shift) {
				key.preventDefault()
				setTargetFocused(false)
				targetEditor?.blur()
				setNavigation((current) => ({ ...current, pane: 'context', level: 'pane' }))
				return
			}
			if (key.name === 'tab') {
				key.preventDefault()
				setTargetVerb((current) => nextRootInputVerb(targetStatus(), current))
				return
			}
			return
		}
		if (inputFocused()) {
			if (key.name === 'escape') {
				key.preventDefault()
				blurComposers()
				setNavigation((current) => ({ ...current, pane: 'events', level: 'pane' }))
				return
			}
			if (key.name === 'tab' && key.shift) {
				// Step out of the composer without leaving the session.
				//
				// Escape does this too, but the arrows do not: the focused editor
				// consumes them for cursor movement, so they never reach this
				// handler. Shift+Tab does reach it, and stepping out of a text field
				// is what it means nearly everywhere else.
				key.preventDefault()
				blurComposers()
				setNavigation((current) => ({ ...current, pane: 'events', level: 'pane' }))
				return
			}
			if (key.name === 'tab') {
				key.preventDefault()
				setVerb((current) => nextRootInputVerb(props.state().status, current))
				return
			}
			// Nothing else: a focused composer owns the keyboard.
			//
			// This block briefly moved panes on left/right, which was dead code. The
			// focused editor consumes the arrows for cursor movement and they never
			// arrive here; logging every key that reaches this handler shows only
			// `escape` and printable characters while the composer has focus. Escape
			// is the way out, and it drops to pane level in the same session rather
			// than leaving it.
			return
		}
		if (key.name === 'j' || key.name === 'down' || key.name === 'k' || key.name === 'up') {
			key.preventDefault()
			moveWithinPane(key.name === 'j' || key.name === 'down' ? 1 : -1)
			pendingG = false
			return
		}
		if (key.name === 'G' || (key.name === 'g' && key.shift)) {
			key.preventDefault()
			jumpWithinPane('last')
			pendingG = false
			return
		}
		if (key.name === 'g') {
			key.preventDefault()
			if (pendingG) jumpWithinPane('first')
			pendingG = !pendingG
			return
		}
		pendingG = false
		if (navigation().pane === 'events' && leftTab() === 'changes' && key.name === 'e') {
			key.preventDefault()
			toggleCurrentChange()
			return
		}

		switch (key.name) {
			case 'a': {
				const available = agents()
				if (available.length === 0) return
				const index = available.findIndex((agent) => agent.agentId === selectedAgentId())
				setSelectedAgentId(available[(index + 1) % available.length]?.agentId ?? null)
				return
			}
			case 'escape':
				key.preventDefault()
				if (selectedAgentId() !== null) {
					setSelectedAgentId(null)
					return
				}
				props.onBackToSessions?.()
				return
			case 'q':
				renderer.destroy()
				return
			case 'tab':
				if (navigation().pane === 'events') {
					key.preventDefault()
					toggleChanges()
				} else if (navigation().pane === 'subagents') {
					key.preventDefault()
					nextRailTab()
				}
				return
			case 'enter':
			case 'return':
				key.preventDefault()
				blurComposers()
				activateSelectedPane()
				return
			case 'i':
				key.preventDefault()
				blurComposers()
				focusComposer()
				return
			case 'h':
			case 'left':
				key.preventDefault()
				blurComposers()
				setNavigation((current) => movePane(current, -1, availablePanes()))
				return
			case 'l':
			case 'right':
				key.preventDefault()
				blurComposers()
				setNavigation((current) => movePane(current, 1, availablePanes()))
				return
			case 'z':
				// Cycle how hard unfocused panes collapse: spread -> keep a
				// neighbour readable -> spine everything.
				key.preventDefault()
				setStackMode((current) => (current === 'none' ? 'far' : current === 'far' ? 'all' : 'none'))
				return
			case 'b':
				setToggles((current) => ({ ...current, glow: !current.glow }))
				return
			case 's':
				setToggles((current) => ({ ...current, scanlines: !current.scanlines }))
				return
			case 'f':
				setToggles((current) => ({ ...current, glitch: !current.glitch }))
				return
			case 'v':
				setToggles((current) => ({ ...current, vignette: nextVignetteMode(current.vignette) }))
				return
			case 'r':
				setToggles((current) => ({ ...current, rollingBar: !current.rollingBar }))
				return
			case 'd':
				toggleChanges()
		}
	})

	return (
		<box flexDirection="column" width="100%" height="100%" backgroundColor={tactical.color.void}>
			{/* Six lines, not five: the right column now carries session state, the
			    model line, and the session's scalars, which used to be a bordered
			    panel inside the rail. */}
			<box
				flexDirection="row"
				height={6}
				paddingX={1}
				gap={3}
				alignItems="center"
				border={['bottom']}
				borderStyle={tactical.chrome.frameStyle}
				borderColor={tactical.chrome.border}
			>
				<ascii_font text="FOLD" font="tiny" color={tactical.color.core} />
				<box flexGrow={1} justifyContent="flex-start">
					<text fg={tactical.color.grid} attributes={TextAttributes.BOLD} wrapMode="none" truncate>
						{props.cwd}
					</text>
				</box>
				<box flexDirection="column" alignItems="flex-end" justifyContent="center" flexShrink={0}>
					<box flexDirection="row" gap={1}>
						<text fg={tactical.color.textFaint} wrapMode="none">
							SESSION
						</text>
						<ActivityIndicator state={sessionActivity()} label={sessionActivityLabel()} />
					</box>
					<text wrapMode="none">
						<span style={{ fg: tactical.color.textFaint }}>{`${props.mode} · ${props.profile} · `}</span>
						<span style={{ fg: tactical.color.text }}>{props.state().model}</span>
						<span style={{ fg: tactical.color.textFaint }}>{reasoningLabel()}</span>
					</text>
					{/* The scalars that used to fill a bordered STATUS panel in the
					    rail: glanceable, not navigable. The header row is a fixed
					    five lines and its right column already used them, so this
					    shares the model line's row rather than adding one. */}
					<text fg={tactical.color.textFaint} wrapMode="none">
						{scalarsLine()}
					</text>
				</box>
			</box>

			<box flexGrow={1} flexDirection="row">
				<Show
					when={paneMode('events') !== 'spine'}
					fallback={
						<PaneSpine
							label={leftTab() === 'changes' ? 'CHANGES' : 'EVENTS'}
							height={dimensions().height - 8}
							active={navigation().pane === 'events'}
							badge={String(rows().length)}
							onSelect={() => setNavigation((current) => ({ ...current, pane: 'events', level: 'pane' }))}
						/>
					}
				>
					<box
						width={eventPaneWidth()}
						flexShrink={0}
						flexDirection="column"
						border
						borderStyle={
							paneState('events') === 'focused'
								? tactical.chrome.frameStyle
								: paneState('events') === 'selected'
									? 'double'
									: tactical.chrome.panelStyle
						}
						borderColor={paneBorderColor('events')}
						title={paneTitle('events', leftTab().toUpperCase())}
						titleColor={paneTitleColor('events')}
						backgroundColor={tactical.color.panel}
					>
						<box height={1} flexShrink={0} flexDirection="row" gap={2} paddingLeft={1}>
							<text
								fg={leftTab() === 'events' ? tactical.color.coreBright : tactical.color.textDim}
								onMouseDown={() => leftTab() === 'changes' && toggleChanges()}
							>
								EVENTS
							</text>
							<text
								fg={leftTab() === 'changes' ? tactical.color.coreBright : tactical.color.textDim}
								onMouseDown={() => leftTab() === 'events' && toggleChanges()}
							>
								CHANGES
							</text>
						</box>
						<scrollbox
							ref={(renderable) => {
								eventsScroller = renderable
								changesScroller = renderable
							}}
							flexGrow={1}
							scrollY
							scrollbarOptions={tuiScrollbarOptions()}
						>
							<Show
								when={leftTab() === 'events'}
								fallback={
									<Show
										when={gitSnapshot()._tag === 'ready'}
										fallback={<text fg={tactical.color.alert}>{` ${gitSnapshotMessage()}`}</text>}
									>
										<Show
											when={changes().length > 0}
											fallback={<text fg={tactical.color.textFaint}> WORKTREE CLEAN</text>}
										>
											<For each={changeGroups}>
												{(group) => (
													<Show when={changes().some((change) => change.group === group.id)}>
														<text
															fg={tactical.color.grid}
															attributes={TextAttributes.BOLD}
														>{` ${group.label}`}</text>
														<For
															each={changes().filter(
																(change) => change.group === group.id,
															)}
														>
															{(change) => (
																<box
																	id={`change:${change.key}`}
																	height={1}
																	flexDirection="row"
																	paddingLeft={1}
																	onMouseDown={() =>
																		selectChange(
																			changes().findIndex(
																				(item) => item.key === change.key,
																			),
																		)
																	}
																>
																	<text
																		width={2}
																		fg={
																			currentChange()?.key === change.key
																				? tactical.color.coreBright
																				: tactical.color.textDim
																		}
																	>
																		{currentChange()?.key === change.key
																			? '▸'
																			: ' '}
																	</text>
																	<text width={3} fg={tactical.color.grid}>
																		{change.status}
																	</text>
																	<text
																		width={2}
																		fg={
																			isChangeViewed(
																				props.viewedPatchHashes?.() ?? {},
																				change,
																			)
																				? tactical.color.textFaint
																				: tactical.color.coreBright
																		}
																	>
																		{isChangeViewed(
																			props.viewedPatchHashes?.() ?? {},
																			change,
																		)
																			? '✓'
																			: '●'}
																	</text>
																	<text
																		flexGrow={1}
																		truncate
																		fg={
																			currentChange()?.key === change.key
																				? tactical.color.coreBright
																				: tactical.color.text
																		}
																	>
																		{change.path}
																	</text>
																	<text fg={tactical.color.grid} wrapMode="none">
																		{`+${change.additions}`}
																	</text>
																	<text fg={tactical.color.alert} wrapMode="none">
																		{`-${change.deletions}`}
																	</text>
																</box>
															)}
														</For>
													</Show>
												)}
											</For>
										</Show>
									</Show>
								}
							>
								<Index
									each={rows()}
									fallback={<text fg={tactical.color.textFaint}> WAITING FOR EVENTS</text>}
								>
									{(row) => (
										<EventIndexRow
											row={row}
											selected={() =>
												navigation().selectedKey === row().key ||
												(mode() === 'live' && row().key === lastRowKey())
											}
										/>
									)}
								</Index>
							</Show>
						</scrollbox>
						<Show when={leftTab() === 'events'}>
							<box
								flexDirection="column"
								height={5}
								flexShrink={0}
								paddingLeft={1}
								paddingRight={1}
								border={['top']}
								borderStyle={inputFocused() ? tactical.chrome.frameStyle : tactical.chrome.panelStyle}
								borderColor={inputFocused() ? tactical.color.coreBright : tactical.chrome.border}
								backgroundColor={inputFocused() ? tactical.color.raised : tactical.color.panel}
							>
								<box flexDirection="row" height={3} flexShrink={0} gap={1} alignItems="flex-start">
									<text wrapMode="none">
										<span style={{ fg: tactical.color.grid }}>›</span>
										<span style={{ fg: tactical.color.text }}> [</span>
										<span style={{ fg: tactical.color.coreBright }}>{verbLabel()}</span>
										<span style={{ fg: tactical.color.text }}>] </span>
									</text>
									<textarea
										ref={(renderable) => {
											editor = renderable
										}}
										flexGrow={1}
										height={2}
										focused={inputFocused()}
										initialValue={draft()}
										placeholder={inputFocused() ? 'MESSAGE ROOT' : 'I TO FOCUS'}
										placeholderColor={tactical.color.grid}
										textColor={tactical.color.text}
										focusedTextColor={tactical.color.coreBright}
										backgroundColor={tactical.color.panel}
										focusedBackgroundColor={tactical.color.raised}
										cursorColor={tactical.color.core}
										cursorStyle={{ style: 'line', blinking: true }}
										onSubmit={submitDraft}
										onContentChange={() => setDraft(editor?.plainText ?? '')}
									/>
								</box>
								<box flexDirection="row" height={1} flexShrink={0}>
									<text
										fg={props.notice() === null ? tactical.color.grid : tactical.color.coreBright}
										wrapMode="none"
									>
										{props.notice() ?? ''}
									</text>
									<box flexGrow={1} />
									<text fg={tactical.color.textDim} wrapMode="none">
										{inputFocused() ? 'ENTER SEND · SHIFT+ENTER NEWLINE · TAB TYPE' : 'I INPUT'}
									</text>
								</box>
								<Show when={isCompacting()}>
									<box
										position="absolute"
										top={0}
										left={0}
										width="100%"
										height="100%"
										zIndex={5}
										paddingLeft={1}
										flexDirection="column"
										justifyContent="center"
										backgroundColor={tactical.color.raised}
									>
										<text
											fg={tactical.color.coreBright}
											attributes={TextAttributes.BOLD}
											wrapMode="none"
										>
											⧗ COMPACTING CONTEXT
										</text>
										<text fg={tactical.color.textDim} wrapMode="none">
											SUMMARIZING CONVERSATION
										</text>
									</box>
								</Show>
							</box>
						</Show>
					</box>
				</Show>
				<Show
					when={paneMode('context') !== 'spine'}
					fallback={
						<PaneSpine
							label="CONTEXT"
							height={dimensions().height - 8}
							active={navigation().pane === 'context'}
							onSelect={() =>
								setNavigation((current) => ({ ...current, pane: 'context', level: 'pane' }))
							}
						/>
					}
				>
					<box
						flexGrow={1}
						flexDirection="column"
						border
						borderStyle={
							paneState('context') === 'focused'
								? tactical.chrome.frameStyle
								: paneState('context') === 'selected'
									? 'double'
									: tactical.chrome.panelStyle
						}
						borderColor={paneBorderColor('context')}
						title={paneTitle(
							'context',
							`${TUI_CONTEXT_TITLE.trim()} · [${readerMode() === 'live' ? TUI_LIVE_BADGE : TUI_INSPECT_BADGE}] · ${contextSubject()}`,
							contextPaneWidth() - 8,
						)}
						titleColor={paneTitleColor('context')}
						backgroundColor={tactical.color.panel}
					>
						<scrollbox
							ref={(renderable) => {
								contextScroller = renderable
							}}
							flexGrow={1}
							scrollY
							stickyScroll={readerMode() === 'live'}
							stickyStart="bottom"
							scrollbarOptions={tuiScrollbarOptions()}
						>
							<Show
								when={leftTab() === 'events'}
								fallback={
									<Show
										when={gitSnapshot()._tag === 'ready'}
										fallback={<text fg={tactical.color.alert}>{gitSnapshotMessage()}</text>}
									>
										<For each={changes()}>
											{(change) => {
												const displayedDiff = () =>
													expandedChanges().has(change.key)
														? change.expandedDiff
														: change.diff
												return (
													<box
														id={`diff:${change.key}`}
														flexDirection="column"
														flexShrink={0}
														paddingX={1}
														paddingTop={1}
													>
														<text
															fg={
																currentChange()?.key === change.key
																	? tactical.color.coreBright
																	: tactical.color.grid
															}
															attributes={TextAttributes.BOLD}
															wrapMode="none"
														>
															{/* The path yields before the state words. A fixed
														    string truncated from the right, which is what this
														    was, drops FULL FILE first, so the pane stopped
														    saying whether the diff was expanded exactly when
														    the pane got narrow. */}
															{renderRow(
																(
																	[
																		{ text: '--', weight: 'required' },
																		{
																			text: change.path,
																			weight: 'subject',
																			minWidth: 8,
																		},
																		{
																			text:
																				currentChange()?.key === change.key
																					? '· SELECTED'
																					: '',
																			weight: 'optional',
																			priority: 2,
																		},
																		{
																			text: `· ${change.group.toUpperCase()}`,
																			weight: 'optional',
																			priority: 1,
																		},
																		{
																			text: expandedChanges().has(change.key)
																				? '· FULL FILE'
																				: '',
																			weight: 'optional',
																			priority: 3,
																		},
																	] satisfies ReadonlyArray<RowCell>
																).filter((cell) => cell.text !== ''),
																Math.max(0, contextPaneWidth() - 6),
															)}
														</text>
														<diff
															diff={displayedDiff()}
															view="unified"
															width="100%"
															height={diffHeight(displayedDiff())}
															flexShrink={0}
															wrapMode="word"
															showLineNumbers
															fg={tactical.color.text}
															addedSignColor={tactical.color.grid}
															removedSignColor={tactical.color.alert}
															lineNumberFg={tactical.color.textDim}
														/>
													</box>
												)
											}}
										</For>
									</Show>
								}
							>
								<Index
									each={visibleContextRows()}
									fallback={
										<box paddingLeft={1}>
											<text fg={tactical.color.textFaint}>
												{replayIsReady(props.state().replay)
													? 'WAITING FOR ROOT-AGENT OUTPUT'
													: 'LOADING CONVERSATION HISTORY'}
											</text>
										</box>
									}
								>
									{(row) => (
										<Show
											when={focusedAgent() === undefined && mode() === 'inspect'}
											fallback={<EventRow row={row} />}
										>
											<EventDetail row={row} />
										</Show>
									)}
								</Index>
							</Show>
						</scrollbox>
						<Show when={focusedAgent()}>
							<box
								height={5}
								flexShrink={0}
								flexDirection="column"
								border={['top']}
								borderColor={targetFocused() ? tactical.color.coreBright : tactical.chrome.border}
								backgroundColor={targetFocused() ? tactical.color.raised : tactical.color.panel}
								paddingX={1}
							>
								<box height={1} flexDirection="row">
									<text fg={tactical.color.coreBright} wrapMode="none">
										{`[${targetVerbLabel()}]`}
									</text>
									<box flexGrow={1} />
									<Show when={focusedAgent()?.status === 'running'}>
										<text
											fg={tactical.color.textDim}
											wrapMode="none"
											onMouseDown={() => {
												const agent = focusedAgent()
												if (agent !== undefined) props.onTargetInterrupt?.(agent.agentId)
											}}
										>
											^C INTERRUPT
										</text>
									</Show>
								</box>
								<textarea
									ref={(value: TextareaRenderable) => (targetEditor = value)}
									height={2}
									focused={targetFocused()}
									placeholder={targetFocused() ? 'MESSAGE SUBAGENT' : 'I TO FOCUS'}
									initialValue={targetDraft()}
									onContentChange={() => setTargetDraft(targetEditor?.plainText ?? '')}
									placeholderColor={tactical.color.grid}
									textColor={tactical.color.text}
									focusedTextColor={tactical.color.coreBright}
									backgroundColor={tactical.color.panel}
									focusedBackgroundColor={tactical.color.raised}
									cursorColor={tactical.color.coreBright}
									cursorStyle={{ style: 'line', blinking: true }}
									onSubmit={submitTargetDraft}
								/>
								<text fg={tactical.color.coreBright} wrapMode="none" truncate>
									{props.targetNotice?.()?.agentId === focusedAgent()?.agentId
										? props.targetNotice?.()?.text
										: ''}
								</text>
							</box>
						</Show>
						<Show when={focusedAgent()}>
							<box
								position="absolute"
								right={1}
								bottom={-1}
								zIndex={10}
								width={(focusedAgent()?.agentId.length ?? 0) + 2}
								height={1}
								justifyContent="center"
								backgroundColor={tactical.color.panel}
							>
								<text fg={tactical.color.coreBright} wrapMode="none">
									{focusedAgent()?.agentId}
								</text>
							</box>
						</Show>
					</box>
				</Show>
				{/* The rail is not rendered at zero width: an empty bordered column is
				    still two columns of border, and a session with no subagents should
				    not pay for a panel that has nothing to list. */}
				<Show when={railPaneWidth() > 0}>
					<Show
						when={paneMode('rail') !== 'spine'}
						fallback={
							<PaneSpine
								label={railTab() === 'skills' ? 'SKILLS' : 'SUBAGENTS'}
								height={dimensions().height - 8}
								active={navigation().pane === 'subagents'}
								badge={railTab() === 'skills' ? String(skills().length) : String(agents().length)}
								onSelect={() =>
									setNavigation((current) => ({ ...current, pane: 'subagents', level: 'pane' }))
								}
							/>
						}
					>
						<box
							width={railPaneWidth()}
							flexShrink={0}
							flexDirection="column"
							border
							borderStyle={
								paneState('subagents') === 'focused'
									? tactical.chrome.frameStyle
									: paneState('subagents') === 'selected'
										? 'double'
										: tactical.chrome.panelStyle
							}
							borderColor={paneBorderColor('subagents')}
							title={paneTitle('subagents', railTab().toUpperCase())}
							titleColor={paneTitleColor('subagents')}
							backgroundColor={tactical.color.panel}
						>
							{/* The sections the session actually has, rather than a fixed tab pair.
			    A section with nothing in it is not listed, and the ones you have not
			    opened lately shrink to their glyph, so the bar stays one row however
			    many sections exist. */}
							<box height={1} flexDirection="row" gap={1} paddingLeft={1}>
								<Index each={activeSections()}>
									{(section) => (
										<text
											fg={
												railTab() === section().id
													? tactical.color.coreBright
													: section().active === true
														? tactical.color.core
														: tactical.color.textDim
											}
											onMouseDown={() => selectRailSection(section().id)}
											wrapMode="none"
										>
											{railTab() === section().id
												? section().label
												: (sectionViews().find((view) => view.id === section().id)?.text ??
													section().icon)}
										</text>
									)}
								</Index>
								<box flexGrow={1} />
								<text fg={tactical.color.grid} wrapMode="none">
									{railRunLabel()}
								</text>
							</box>
							<Show
								when={railTab() === 'subagents'}
								fallback={
									<Switch
										fallback={
											<SkillsRail
												skills={skills()}
												selected={selectedSkill()}
												active={navigation().pane === 'subagents'}
												width={railInner()}
												onSelect={setSelectedSkill}
											/>
										}
									>
										<Match when={railTab() === 'changes'}>
											<ChangesSection
												changes={changes()}
												width={railInner()}
												onSelect={(change) => props.onViewChange?.(change)}
											/>
										</Match>
										<Match when={railTab() === 'models'}>
											<ModelsSection
												providers={props.configuration?.providers ?? []}
												current={props.state().model}
												width={railInner()}
											/>
										</Match>
										<Match when={railTab() === 'settings'}>
											<SettingsSection
												cwd={props.cwd}
												mode={props.mode}
												profile={props.profile}
												model={props.state().model}
												reasoning={props.state().reasoningLevel ?? 'off'}
												width={railInner()}
											/>
										</Match>
									</Switch>
								}
							>
								<scrollbox
									ref={(renderable) => (subagentsScroller = renderable)}
									flexGrow={1}
									scrollY
									scrollbarOptions={tuiScrollbarOptions()}
								>
									<Index
										each={agents()}
										fallback={<text fg={tactical.color.textFaint}> NO SUBAGENTS</text>}
									>
										{(agent) => (
											<SubagentRow
												agent={agent()}
												selected={selectedAgentId() === agent().agentId}
												now={now()}
												width={railInner()}
												onSelect={() => setSelectedAgentId(agent().agentId)}
											/>
										)}
									</Index>
								</scrollbox>
							</Show>
							{/* The session's shape: the fleet by type and the tool tally.
						    These were a whole tab once, which cost a third of a
						    permanently-visible pane. Now they are two lines while the rail
						    is a sidebar and expand into labelled bars when it is focused,
						    which is the row behaviour applied to a pane. */}
							<Show
								when={
									metaDensity(railInner(), dimensions().height, focusedPane() === 'rail') ===
									'expanded'
								}
								fallback={
									<>
										<Show when={railTab() === 'subagents' && agentTypes() !== ''}>
											<box height={1} flexShrink={0} paddingLeft={1}>
												<text fg={tactical.color.textDim} wrapMode="none">
													{agentTypes()}
												</text>
											</box>
										</Show>
										<Show when={railTab() === 'subagents' && toolTally() !== ''}>
											<box height={1} flexShrink={0} paddingLeft={1} marginBottom={1}>
												<text fg={tactical.color.textDim} wrapMode="none">
													{toolTally()}
												</text>
											</box>
										</Show>
									</>
								}
							>
								<box flexDirection="column" flexShrink={0} paddingLeft={1} marginBottom={1}>
									<Show when={railTab() === 'subagents' && agentTypeBars().length > 0}>
										<text fg={tactical.color.textFaint} wrapMode="none">
											{`AGENT TYPES · ${meta().agents}`}
										</text>
										<Index each={agentTypeBars()}>
											{(row) => (
												<text wrapMode="none">
													<span
														style={{ fg: tactical.color.textDim }}
													>{`${row().label} `}</span>
													<span style={{ fg: agentTypeAccent(row().label.trim()) }}>
														{row().bar}
													</span>
													<span style={{ fg: tactical.color.text }}>{` ${row().count}`}</span>
												</text>
											)}
										</Index>
									</Show>
									<Show when={railTab() === 'subagents' && toolBars().length > 0}>
										<text fg={tactical.color.textFaint} wrapMode="none">
											{`TOOL CALLS · ${meta().tools}`}
										</text>
										<Index each={toolBars()}>
											{(row) => (
												<text wrapMode="none">
													<span style={{ fg: tactical.color.textDim }}>
														{`${toolGlyph(row().label.trim())} ${row().label} `}
													</span>
													<span style={{ fg: tactical.color.core }}>{row().bar}</span>
													<span style={{ fg: tactical.color.text }}>{` ${row().count}`}</span>
												</text>
											)}
										</Index>
									</Show>
								</box>
							</Show>
						</box>
					</Show>
				</Show>
			</box>
			<box
				flexDirection="row"
				height={2}
				paddingX={1}
				gap={1}
				alignItems="center"
				border={['top']}
				borderStyle={tactical.chrome.frameStyle}
				borderColor={tactical.chrome.border}
			>
				<KeyHint keyName="H/L" label="PANE" />
				<KeyHint keyName="J/K" label="NAV" />
				{/* ESC unwinds one step at a time: it leaves the composer, then drops
				    the selected subagent, and only then leaves the session. The label
				    has to say which of those the next press will do, or it promises
				    an exit that is actually one keystroke further away. */}
				<KeyHint
					keyName="ESC"
					label={
						navigation().level !== 'pane' ? 'BACK' : selectedAgentId() !== null ? 'DESELECT' : 'SESSIONS'
					}
				/>
				<KeyHint keyName="^N" label="NEW" />
				<KeyHint keyName="^K" label="COMMANDS" />
				<KeyHint keyName="^C" label="INTRPT" />
				<KeyHint keyName="Q" label="QUIT" />
				<box flexGrow={1} />
				<FxFooter toggles={toggles()} verbose={verboseFooter()} />
			</box>
			<box
				position="absolute"
				right={1}
				bottom={2}
				zIndex={10}
				width={props.sessionId.length + 2}
				height={1}
				justifyContent="center"
				backgroundColor={tactical.color.panel}
				onMouseDown={(event) => {
					event.preventDefault()
					props.onCopySessionId?.()
				}}
			>
				<text fg={tactical.color.coreBright} wrapMode="none">
					{props.sessionId}
				</text>
			</box>
			<Show when={paletteOpen()}>
				<CommandPalette commands={paletteCommands()} onClose={() => setPaletteOpen(false)} />
			</Show>
			<Show when={newSessionOpen()}>
				<NewSessionModal
					cwd={props.cwd}
					configuration={props.configuration ?? { profiles: [], providers: [] }}
					onClose={() => setNewSessionOpen(false)}
					onSubmit={(request) => {
						setNewSessionOpen(false)
						props.onNewSession?.(request)
					}}
				/>
			</Show>
			<Show when={modelsOpen()}>
				<ModelSelectionModal
					configuration={props.configuration ?? { profiles: [], providers: [] }}
					context="active"
					onClose={() => setModelsOpen(false)}
					onSubmit={(selection) => {
						setModelsOpen(false)
						props.onConfigureModels?.(selection)
					}}
				/>
			</Show>
			<Show when={confirmSkill()}>
				<box
					position="absolute"
					top={8}
					left={Math.max(2, Math.floor((dimensions().width - 68) / 2))}
					width={Math.min(68, dimensions().width - 4)}
					height={9}
					zIndex={70}
					padding={1}
					flexDirection="column"
					border
					borderStyle="double"
					borderColor={tactical.color.coreBright}
					backgroundColor={tactical.color.panel}
				>
					<text fg={tactical.color.coreBright} attributes={TextAttributes.BOLD}>
						INJECT SKILL?
					</text>
					<box height={1} />
					<text fg={tactical.color.text} wrapMode="none" truncate>
						{`${confirmSkill()} → ${skillTargetAgent()?.type ?? 'Primary'} Agent`}
					</text>
					<text wrapMode="none" truncate>
						<span style={{ fg: tactical.color.textDim }}>Description: </span>
						<span style={{ fg: tactical.color.text }}>
							{skillTargetAgent()?.description ?? 'Root session agent'}
						</span>
					</text>
					<box height={1} />
					<text fg={tactical.color.textDim}>Add this skill's instructions to the agent context?</text>
					<text fg={tactical.color.coreBright}>Y confirm · N cancel</text>
				</box>
			</Show>
		</box>
	)
}
