import { createContext, useContext } from 'react'

import { tactical } from './tactical'
import type { Theme, ThemeId } from './types'

export * from './types'

/**
 * fold ships ONE theme.
 *
 * Six themes existed and every one of them failed on readability: the dim tier
 * that carries labels, borders and footers measured 2.4-4.6:1 against its own
 * background. There is now a single palette held above fixed contrast floors
 * (see tactical.ts), so there is nothing to cycle and no way to pick a
 * worse-looking one. The registry shape stays for callers.
 */
export const THEME_ORDER = ['tactical'] as const satisfies readonly ThemeId[]

export const THEMES: Readonly<Record<ThemeId, Theme>> = { tactical }

export function isThemeId(value: string): value is ThemeId {
	return Object.hasOwn(THEMES, value)
}

const ThemeContext = createContext<Theme>(tactical)

export const ThemeProvider = ThemeContext.Provider

export function useTheme(): Theme {
	return useContext(ThemeContext)
}
