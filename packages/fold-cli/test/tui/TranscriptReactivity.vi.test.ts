import { createComputed, createMemo, createRoot, createSignal } from 'solid-js'
import { describe, expect, it } from 'vitest'

/**
 * Guards the reactive shape of the transcript, which is what decides whether a
 * streamed token repaints one line or the whole screen.
 *
 * These assertions are only meaningful against Solid's client build: the server
 * build's primitives are inert, and every "does not invalidate" claim passes
 * vacuously there. `vitest.config.ts` pins the browser condition for that
 * reason, and the first test fails loudly if that pin is ever lost.
 */
describe('transcript reactivity', () => {
	it('runs real reactivity, so the assertions below can fail', () => {
		const [value, setValue] = createSignal(0)
		let runs = 0
		createRoot(() => {
			createComputed(() => {
				runs += 1
				void value()
			})
		})
		setValue(1)
		expect(runs, 'Solid resolved to its inert server build; check resolve.conditions').toBe(2)
	})

	/**
	 * Each rendered row asks whether it is the live tail. Reading the row list to
	 * answer that subscribes every row to the list, so a token lands and all N
	 * rows re-run: at 800 rows that was 800 recomputations per token, roughly 60
	 * times a second, which is what made live output choppy. The streaming row's
	 * key does not change while its text does, so a memo over just the key
	 * settles to the same string and the invalidation stops there.
	 */
	const countRowRuns = (rowCount: number, readWholeList: boolean): number => {
		const [tail, setTail] = createSignal('')
		let runs = 0
		const dispose = createRoot((disposer) => {
			const rows = createMemo(() => [
				...Array.from({ length: rowCount }, (_, index) => ({ key: `durable:${index}` })),
				{ key: 'transient:live', text: tail() },
			])
			const lastRowKey = createMemo(() => rows().at(-1)?.key)
			for (let index = 0; index < rowCount; index += 1) {
				const key = `durable:${index}`
				createComputed(() => {
					runs += 1
					// Stands in for the row's `selected` accessor.
					if (readWholeList) void (key === rows().at(-1)?.key)
					else void (key === lastRowKey())
				})
			}
			return disposer
		})
		runs = 0
		setTail('token ')
		dispose()
		return runs
	}

	it('does not re-run every row when one streaming token lands', () => {
		expect(countRowRuns(200, false)).toBe(0)
		expect(countRowRuns(800, false)).toBe(0)
	})

	it('would re-run every row if the accessor read the whole row list', () => {
		// The negative case, so the test above cannot pass by measuring nothing.
		expect(countRowRuns(200, true)).toBe(200)
		expect(countRowRuns(800, true)).toBe(800)
	})
})
