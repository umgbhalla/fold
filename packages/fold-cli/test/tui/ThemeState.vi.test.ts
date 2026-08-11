import { THEMES } from '@humanlayer/fold-tui-theme/themes'
import { describe, expect, it } from 'vitest'

import { setCurrentTheme, theme } from '../../src/tui/ThemeState'

describe('TUI theme state', () => {
	it('ships exactly one theme', () => {
		expect(Object.keys(THEMES)).toEqual(['tactical'])
	})

	it('holds the shipped theme after an explicit set', () => {
		const tactical = structuredClone(THEMES.tactical)

		setCurrentTheme('tactical')

		expect(theme).toEqual(tactical)
		expect(THEMES.tactical).toEqual(tactical)
	})

	it('keeps the F glitch control defined so the fx chain compiles', () => {
		for (const candidate of Object.values(THEMES)) expect(candidate.fx.glitch).toBeDefined()
	})
})
