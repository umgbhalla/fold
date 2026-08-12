/**
 * How much of itself a section shows, decided by how recently it mattered.
 *
 * A collapsed pane today is uniform: every section gets the same vertical
 * letters whether you were reading it a second ago or have never opened it.
 * That wastes the one thing a spine has to spend, which is rows. A session with
 * six sections cannot give them all a spelled-out name, and should not: the one
 * you just left is worth a word, and the one you have never opened is worth a
 * glyph.
 *
 * So sections decay. Touch one and it is `full`. Leave it and it falls to
 * `short`, then to `icon`, as newer things push past it. Activity pushes back
 * the other way: a section that is doing something (a subagent running, a diff
 * arriving) is worth naming even if you have not looked at it, because the
 * point of a spine is to tell you where to look next.
 *
 * ```
 *   most recent ─────────────────────────────► least recent
 *   ┌─────────┐ ┌───────┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐
 *   │SUBAGENTS│ │SKILLS │ │ ⎇ │ │ ⚙ │ │ ✦ │ │ ▤ │
 *   │   ● 3   │ │       │ │ 2 │ │   │ │   │ │   │
 *   └─────────┘ └───────┘ └───┘ └───┘ └───┘ └───┘
 *     full        short    icon  icon  icon  icon
 * ```
 */

/** What a section shows in a collapsed rail. */
export type SectionDetail = 'full' | 'short' | 'icon'

export type RailSection = {
	readonly id: string
	/** Spelled-out name, used at `full`. */
	readonly label: string
	/** One glyph, used at `icon`. Should read at a glance without its name. */
	readonly icon: string
	/** Ordinal of last visit; higher is more recent. Zero means never visited. */
	readonly lastTouched: number
	/** Something is happening here now, whether or not it was visited. */
	readonly active?: boolean
	/** Count worth surfacing (agents, skills, changed files). */
	readonly count?: number
}

export type SectionView = {
	readonly id: string
	readonly detail: SectionDetail
	/** What to draw: the label, an abbreviation, or the icon. */
	readonly text: string
	readonly rows: number
	readonly count: number | undefined
}

/** Rows a section occupies at each detail level, borders included. */
const rowsFor = (detail: SectionDetail, label: string, hasCount: boolean): number => {
	const content = detail === 'full' ? label.length : detail === 'short' ? Math.min(label.length, 4) : 1
	return content + 2 + (hasCount ? 1 : 0)
}

const shorten = (label: string): string => label.slice(0, 4)

/**
 * Fit sections into `height` rows, spending detail on the most recent first.
 *
 * Greedy from the top of the recency order rather than proportional: giving
 * every section a little detail produces six abbreviations, none of which reads
 * as a word. Giving the top one or two their full name and the rest a glyph is
 * what makes the column scannable.
 *
 * Active sections sort as if just touched, so a subagent finishing while you
 * are elsewhere promotes its section instead of letting it decay silently.
 */
export const railSections = (sections: ReadonlyArray<RailSection>, height: number): ReadonlyArray<SectionView> => {
	if (sections.length === 0 || height <= 0) return []

	const ordered = [...sections].sort((left, right) => {
		// Active first, then most recently touched.
		if (left.active !== right.active) return left.active === true ? -1 : 1
		return right.lastTouched - left.lastTouched
	})

	// Everything starts as an icon, which is the floor that always fits.
	const detail = new Map<string, SectionDetail>()
	for (const section of ordered) detail.set(section.id, 'icon')
	const used = (): number =>
		ordered.reduce(
			(sum, section) =>
				sum + rowsFor(detail.get(section.id) ?? 'icon', section.label, section.count !== undefined),
			0,
		)

	// Then upgrade in recency order, each section as far as it can go before the
	// next one is considered. Spreading `short` across everything first was the
	// obvious order and the wrong one: six abbreviations consumed the budget and
	// nothing ever reached `full`, so the column read as six unlabelled stubs.
	// Depth before breadth is what makes the top of the column a readable word.
	for (const section of ordered) {
		for (const level of ['full', 'short'] as const) {
			const current = detail.get(section.id) ?? 'icon'
			if (current === level) break
			detail.set(section.id, level)
			if (used() <= height) break
			detail.set(section.id, current)
		}
	}

	// Everything as an icon is the floor, and even that can overflow a short
	// rail. Drop the least recent sections rather than draw past the border.
	const fitted: Array<RailSection> = []
	let spent = 0
	for (const section of ordered) {
		const rows = rowsFor(detail.get(section.id) ?? 'icon', section.label, section.count !== undefined)
		if (spent + rows > height) break
		fitted.push(section)
		spent += rows
	}

	return fitted.map((section) => {
		const level = detail.get(section.id) ?? 'icon'
		return {
			id: section.id,
			detail: level,
			text: level === 'full' ? section.label : level === 'short' ? shorten(section.label) : section.icon,
			rows: rowsFor(level, section.label, section.count !== undefined),
			count: section.count,
		}
	})
}
