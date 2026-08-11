import { accentTrack } from './AccentPalette'

/**
 * How much of the metadata a pane can afford to show.
 *
 * The rail carries three readouts that used to be a whole tab: the fleet by
 * type, the tool tally, and the run/done/error split. META spent 30-odd rows
 * of a permanently-visible pane on those, which is why it was retired: a pane
 * that is always open has to earn its space at its smallest size, not its
 * largest.
 *
 * Focus changes that trade. A focused rail is 66 columns and the whole height,
 * so the same numbers can afford labels and bars there while collapsing to one
 * line each when the rail is a 30-column sidebar. This is the row behaviour
 * applied to a pane: the thing you are looking at expands, everything else
 * shrinks to a summary.
 */
export type MetaDensity = 'line' | 'expanded'

/**
 * Expanded needs a label, a bar and a count on one row without wrapping, and
 * enough rows for both headed lists plus the subagent list they describe.
 *
 * The height floor is 26, not the 12 first tried: at 14 rows the expanded block
 * is taller than the pane, and the bars printed straight through the border and
 * into the status bar ("TOOL CALLS" appeared inside the frame edge). The block
 * can be up to 13 rows on its own (two headers, five agent types, six tools),
 * so the pane needs that plus room to still be a subagent list.
 *
 * Measured at the boundary rather than reasoned about: 24 rows stays collapsed,
 * 26 expands, and nothing bleeds past the border at any size. At 26 the rail
 * still lists 7 of 15 agents beside the metadata (14 at 44 rows), so the block
 * summarises the list rather than replacing it.
 */
export const metaDensity = (width: number, height: number, focused: boolean): MetaDensity =>
	focused && width >= 40 && height >= 26 ? 'expanded' : 'line'

/** A bar drawn against a fixed track, as a share of the series total. */
export const shareBar = (value: number, total: number, width: number): string => {
	if (width <= 0) return ''
	// Share of the total, not of the largest member: normalising against the
	// largest drew a full bar for a single-item series, which reads as "all of
	// them" and is true only by accident.
	const exact = total > 0 ? (value / total) * width : 0
	const whole = Math.min(width, Math.floor(exact))
	return '█'.repeat(whole) + '·'.repeat(Math.max(0, width - whole))
}

export type MetaBarRow = {
	readonly label: string
	readonly count: number
	readonly bar: string
	readonly share: number
}

/**
 * One row per series member: label, bar, count.
 *
 * The bar width is derived from the widest label so the bars line up into a
 * column the eye can compare, rather than each starting wherever its label
 * happened to end.
 */
export const metaBarRows = (
	series: ReadonlyArray<readonly [string, number]>,
	width: number,
	maxRows: number,
): ReadonlyArray<MetaBarRow> => {
	if (series.length === 0 || width <= 0 || maxRows <= 0) return []
	const total = series.reduce((sum, [, count]) => sum + count, 0)
	const shown = series.slice(0, maxRows)
	const countWidth = Math.max(...shown.map(([, count]) => String(count).length))
	const labelWidth = Math.min(Math.max(...shown.map(([label]) => label.length)), Math.max(4, width - countWidth - 6))
	// label + space + bar + space + count
	const barWidth = Math.max(0, width - labelWidth - countWidth - 2)
	return shown.map(([label, count]) => ({
		label: label.length > labelWidth ? `${label.slice(0, labelWidth - 1)}…` : label.padEnd(labelWidth, ' '),
		count,
		bar: shareBar(count, total, barWidth),
		share: total > 0 ? count / total : 0,
	}))
}

/** The colour of a bar's unfilled track, so callers do not reach for it twice. */
export const metaTrackColor = accentTrack
