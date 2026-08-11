import { AgentId, MessageId } from '@humanlayer/fold-core'

import { makeSessionStateFromEntries } from './src/tui/SessionState'

const root = AgentId.make('agent_rrrrrrrrrrrrrrrrrrrrrrrr')
const N = Number(process.argv[2] ?? 4000)

const entries = Array.from({ length: N }, (_, i) => ({
	_tag: 'assistant-message' as const,
	seq: i,
	ts: i,
	agentId: root,
	parentAgentId: null,
	messageId: MessageId.make(`msg_${String(i).padStart(24, 'a')}`),
	content: [{ type: 'text' as const, text: 'hello world this is a message' }],
	finish: 'stop' as const,
	usage: null,
}))

const started = performance.now()
makeSessionStateFromEntries(entries, root)
const elapsed = performance.now() - started
console.log(`${N} entries: replay ${elapsed.toFixed(1)} ms (${(elapsed / N).toFixed(4)} ms/entry)`)
