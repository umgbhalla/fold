import { base } from '@humanlayer/fold-vitest-config'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
	base,
	defineConfig({
		// Vitest resolves dependencies through Vite's SSR pipeline, so the
		// top-level `resolve.conditions` alone does not reach solid-js.
		ssr: {
			resolve: {
				conditions: ['browser', 'import', 'module', 'default'],
			},
		},
		resolve: {
			/**
			 * Solid ships a server build whose reactive primitives are inert, and
			 * that is what `environment: "node"` resolves by default. A test that
			 * asserts "this signal does not invalidate those subscribers" would then
			 * pass because nothing ever invalidates anything. The TUI runs the client
			 * build, so the tests have to as well.
			 */
			conditions: ['browser', 'import', 'module', 'default'],
		},
	}),
)
