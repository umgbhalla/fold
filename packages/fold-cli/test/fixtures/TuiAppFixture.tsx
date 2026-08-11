import { AgentId, MessageId, ToolCallId, type LogEntry } from '@humanlayer/fold-core'
/** @jsxImportSource @opentui/solid */
import { createCliRenderer } from '@opentui/core'
import { render } from '@opentui/solid'
import { createSignal } from 'solid-js'

import { TuiApp } from '../../src/tui/App'
import { rootInputVerbLabel } from '../../src/tui/Converse'
import { makeSessionState, makeSessionStateFromEntries } from '../../src/tui/SessionState'
import { markChangeViewed, type ViewedPatchHashes } from '../../src/tui/ViewedChanges'

let resolveDestroyed: (() => void) | undefined
const destroyed = new Promise<void>((resolve) => {
	resolveDestroyed = resolve
})
const renderer = await createCliRenderer({
	targetFps: 30,
	exitOnCtrlC: false,
	consoleMode: 'disabled',
	useKittyKeyboard: {},
	onDestroy: () => resolveDestroyed?.(),
})
const [status, setStatus] = createSignal<'RUNNING' | 'IDLE' | 'STOPPED'>('IDLE')
const [notice, setNotice] = createSignal<string | null>(null)
const [targetNotice, setTargetNotice] = createSignal<{ readonly agentId: string; readonly text: string } | null>(null)
const [model, setModel] = createSignal('unresolved')
const [viewedPatchHashes, setViewedPatchHashes] = createSignal<ViewedPatchHashes>({})
const fixtureModel = {
	providerId: 'anthropic',
	providerKind: 'anthropic',
	modelId: 'fixture-model',
	role: null,
	requestedReasoningLevel: 'off',
	thinking: { _tag: 'disabled' },
} as const
/**
 * Branded ids reject anything that is not `<prefix>_<21-32 lowercase alnum>`, and
 * `make` throws rather than returning an error, so a readable fixture label has
 * to be padded up to a legal cuid or the whole fixture dies before first paint.
 *
 * The padding is `a` rather than `0` because zero padding collides: `overflow1`
 * and `overflow10` both become `overflow1` followed by zeros, so agents 1 and 10
 * shared an id and the tenth rail row rendered the first one's description.
 */
const fixtureCuid = (label: string): string => `${label.replaceAll(/[^a-z0-9]/g, 'a')}z`.padEnd(24, 'a').slice(0, 24)
const fixtureMessageId = (label: string) => MessageId.make(`msg_${fixtureCuid(label)}`)
const fixtureAgentId = (label: string) => AgentId.make(`agent_${fixtureCuid(label)}`)
const fixtureToolCallId = (label: string) => ToolCallId.make(`tool_call_${fixtureCuid(label)}`)

/**
 * Fixture entries are stamped relative to launch so the rail's age column shows
 * plausible ages. With the literal small numbers these used to carry, every row
 * read `57y`, which made the column look broken while testing rail layout.
 */
const startedAt = Date.now()
const at = (secondsAgo: number): number => startedAt - secondsAgo * 1_000

const rootAgentId = fixtureAgentId('root')
const researcherAgentId = fixtureAgentId('researcher')
const subagentToolCallId = fixtureToolCallId('subagent')
const overflowSubagentEntries: ReadonlyArray<LogEntry> =
	process.env.FOLD_TUI_OVERFLOW_SUBAGENTS_FIXTURE === '1'
		? Array.from({ length: 14 }, (_, index) => {
				const number = index + 1
				const toolCallId = fixtureToolCallId(`overflow${number}`)
				const agentId = fixtureAgentId(`overflow${number}`)
				return [
					{
						_tag: 'assistant-message',
						seq: 100 + index * 2,
						ts: at(600 - index * 37),
						agentId: rootAgentId,
						parentAgentId: null,
						toolCallId: null,
						messageId: fixtureMessageId(`overflow${number}`),
						message: {
							role: 'assistant',
							content: [
								{
									type: 'tool-call',
									id: toolCallId,
									name: 'subagent',
									params: {
										agent: number % 2 === 0 ? 'researcher' : 'general-purpose',
										description: `Overflow task ${number}`,
										prompt: `Inspect overflow task ${number}`,
									},
									providerExecuted: false,
								},
							],
						},
						finish: null,
					},
					{
						_tag: 'agent_started',
						seq: 101 + index * 2,
						ts: at(599 - index * 37),
						agentId,
						parentAgentId: rootAgentId,
						toolCallId,
						agentType: number % 2 === 0 ? 'researcher' : 'general-purpose',
						mode: 'fresh',
						model: fixtureModel,
						tools: [],
						skill: null,
						fork: null,
					},
				] as const
			}).flat()
		: []
const subagentEntries: ReadonlyArray<LogEntry> = [
	{
		_tag: 'agent_started',
		seq: 0,
		ts: at(900),
		agentId: rootAgentId,
		parentAgentId: null,
		toolCallId: null,
		mode: 'fresh',
		model: fixtureModel,
		tools: [],
		skill: null,
		fork: null,
		agentType: null,
	},
	{
		_tag: 'system-message',
		seq: 2,
		ts: at(880),
		agentId: rootAgentId,
		parentAgentId: null,
		toolCallId: null,
		messageId: fixtureMessageId('systemroot'),
		placement: 'leading',
		messages: [
			{
				role: 'system',
				content:
					'<available_skills><skill><name>effect-program-design</name><description>Design Effect programs</description></skill><skill><name>terminal-control</name><description>Drive terminal apps</description></skill></available_skills>',
			},
		],
	},
	...(process.env.FOLD_TUI_EVENT_SUBAGENT_FIXTURE === '1'
		? ([
				{
					_tag: 'assistant-message',
					seq: 6,
					ts: at(300),
					agentId: rootAgentId,
					parentAgentId: null,
					toolCallId: null,
					messageId: fixtureMessageId('rootsubagent'),
					message: {
						role: 'assistant',
						content: [
							{
								type: 'tool-call',
								id: subagentToolCallId,
								name: 'subagent',
								params: { agent: 'researcher', prompt: 'Inspect the event-driven target input' },
								providerExecuted: false,
							},
						],
					},
					finish: null,
				},
			] as const)
		: []),
	{
		_tag: 'system-message',
		seq: 3,
		ts: at(870),
		agentId: researcherAgentId,
		parentAgentId: null,
		toolCallId: null,
		messageId: fixtureMessageId('systemresearcher'),
		placement: 'leading',
		messages: [
			{
				role: 'system',
				content:
					'<available_skills><skill><name>effect-program-design</name><description>Design Effect programs</description></skill><skill><name>terminal-control</name><description>Drive terminal apps</description></skill></available_skills>',
			},
		],
	},
	{
		_tag: 'assistant-message',
		seq: 4,
		ts: at(240),
		agentId: researcherAgentId,
		parentAgentId: null,
		toolCallId: null,
		messageId: fixtureMessageId('researcherskill'),
		message: {
			role: 'assistant',
			content: [
				{
					type: 'tool-call',
					id: 'tool_researcher_skill',
					name: 'skill',
					params: { name: 'terminal-control' },
					providerExecuted: false,
				},
			],
		},
		finish: null,
	},
	...(process.env.FOLD_TUI_STOPPED_SUBAGENT_FIXTURE === '1'
		? ([
				{
					_tag: 'agent-finished',
					seq: 5,
					ts: at(120),
					agentId: researcherAgentId,
					parentAgentId: null,
					toolCallId: null,
					outcome: 'completed',
					resultText: 'research complete',
					reason: null,
				},
			] as const)
		: []),
	{
		_tag: 'agent_started',
		seq: 1,
		ts: at(890),
		agentId: researcherAgentId,
		parentAgentId: rootAgentId,
		toolCallId: subagentToolCallId,
		agentType: 'researcher',
		mode: 'fresh',
		model: fixtureModel,
		tools: [],
		skill: null,
		fork: null,
	},
	...overflowSubagentEntries,
]

await render(
	() => (
		<TuiApp
			state={() => ({
				...(process.env.FOLD_TUI_EVENT_SUBAGENT_FIXTURE === '1'
					? makeSessionStateFromEntries(subagentEntries, rootAgentId)
					: makeSessionState(null)),
				status: status(),
				model: model(),
				allEntries: subagentEntries,
			})}
			cwd="/workspace/fold"
			sessionId="sess_terminal_control"
			mode="default"
			profile="default"
			gitSnapshot={() => ({
				_tag: 'ready',
				files: [
					{
						key: 'staged:src/staged.ts',
						group: 'staged',
						status: 'M',
						path: 'src/staged.ts',
						additions: 1,
						deletions: 1,
						diff: 'diff --git a/src/staged.ts b/src/staged.ts\n--- a/src/staged.ts\n+++ b/src/staged.ts\n@@ -1 +1 @@\n-old\n+new',
						expandedDiff:
							'diff --git a/src/staged.ts b/src/staged.ts\n--- a/src/staged.ts\n+++ b/src/staged.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n context',
						patchHash: 'fixture-source-hash',
					},
					{
						key: 'untracked:notes file.md',
						group: 'untracked',
						status: '??',
						path: 'notes file.md',
						additions: 1,
						deletions: 0,
						diff: 'diff --git a/notes file.md b/notes file.md\n--- /dev/null\n+++ b/notes file.md\n@@ -0,0 +1 @@\n+fixture note',
						expandedDiff:
							'diff --git a/notes file.md b/notes file.md\n--- /dev/null\n+++ b/notes file.md\n@@ -0,0 +1 @@\n+fixture note',
						patchHash: 'fixture-notes-hash',
					},
				],
			})}
			viewedPatchHashes={viewedPatchHashes}
			onViewChange={(change) => setViewedPatchHashes((viewed) => markChangeViewed(viewed, change))}
			onRefreshGit={() => setNotice('CHANGES REFRESHED')}
			{...(process.env.FOLD_TUI_SUBAGENT_FIXTURE === '1' ? { initialSelectedAgentId: researcherAgentId } : {})}
			notice={notice}
			targetNotice={targetNotice}
			onCompact={() => setNotice('COMPACTED')}
			onSubmit={(verb, text) => {
				setNotice(`${rootInputVerbLabel(verb)} RECEIVED · ${text.replaceAll('\n', ' / ')}`)
				setStatus('RUNNING')
			}}
			onInterrupt={() => {
				setNotice('INTERRUPT REQUESTED')
				setStatus('STOPPED')
			}}
			onTargetSubmit={(agentId, _text, verb) =>
				setTargetNotice({ agentId, text: verb === 'send' ? 'TARGET RESUME RECEIVED' : 'TARGET STEER RECEIVED' })
			}
			onTargetInterrupt={(agentId) => {
				setTargetNotice({ agentId, text: 'TARGET INTERRUPT REQUESTED' })
				setModel('target-interrupted')
			}}
			onInjectSkill={(skill, agentId) => {
				if (agentId === null) setNotice(`SKILL INJECTED · ${skill}`)
				else setTargetNotice({ agentId, text: `SKILL INJECTED · ${skill}` })
			}}
			onNewSession={() => {
				setNotice('NEW SESSION REQUESTED')
				setModel('new-session-requested')
			}}
			onBackToSessions={() => {
				setNotice('SESSION LIST REQUESTED')
				setModel('session-list-requested')
			}}
			onCopySessionId={() => setNotice('SESSION ID COPIED')}
		/>
	),
	renderer,
)
renderer.start()
await destroyed
