import { appendFileSync } from 'node:fs'

/** @jsxImportSource @opentui/solid */
import { createCliRenderer } from '@opentui/core'
import { render } from '@opentui/solid'
import { createSignal, onCleanup, Show } from 'solid-js'

/**
 * How expensive is a route switch that unmounts its subtree?
 *
 * The app swaps between the session picker and the session view with `Show`,
 * which destroys and recreates everything below it. This measures that: a
 * subtree of the same rough shape as a session view, toggled, counting how many
 * component bodies run and how long the swap takes.
 */
const OUT = process.env.SWITCH_BENCH_OUT ?? '/tmp/switch-bench.txt'
const ROWS = Number(process.env.SWITCH_ROWS ?? '300')
const SWITCHES = Number(process.env.SWITCH_COUNT ?? '20')

let bodyRuns = 0
let disposals = 0

const Row = (props: { readonly index: number }) => {
	bodyRuns += 1
	onCleanup(() => {
		disposals += 1
	})
	return <text wrapMode="none">{`row ${props.index} of the transcript, long enough to wrap once or twice`}</text>
}

const Heavy = () => (
	<box flexDirection="column">
		{Array.from({ length: ROWS }, (_, index) => (
			<Row index={index} />
		))}
	</box>
)

const renderer = await createCliRenderer({
	targetFps: 60,
	exitOnCtrlC: false,
	consoleMode: 'disabled',
	useKittyKeyboard: {},
})

const [onPage, setOnPage] = createSignal(true)

/**
 * `keep` renders both subtrees once and hides the inactive one, instead of
 * destroying it. Set SWITCH_KEEP=1 to measure that side of the comparison.
 */
const keepMounted = process.env.SWITCH_KEEP === '1'

await render(
	() =>
		keepMounted ? (
			<box flexDirection="column">
				<box flexDirection="column" visible={onPage()}>
					<Heavy />
				</box>
				<box flexDirection="column" visible={!onPage()}>
					<text>PICKER</text>
				</box>
			</box>
		) : (
			<Show when={onPage()} fallback={<text>PICKER</text>}>
				<Heavy />
			</Show>
		),
	renderer,
)

await new Promise((resolve) => setTimeout(resolve, 800))

bodyRuns = 0
disposals = 0
const started = performance.now()
const cpuBefore = process.cpuUsage()
for (let index = 0; index < SWITCHES; index += 1) {
	setOnPage(index % 2 === 0)
	await new Promise((resolve) => setTimeout(resolve, 30))
}
const wall = performance.now() - started
const cpu = process.cpuUsage(cpuBefore)

renderer.destroy()
appendFileSync(
	OUT,
	`rows=${ROWS} switches=${SWITCHES} bodyRuns=${bodyRuns} disposals=${disposals} wall=${wall.toFixed(0)}ms cpu=${((cpu.user + cpu.system) / 1000).toFixed(0)}ms\n`,
)
process.exit(0)
