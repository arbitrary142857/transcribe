/**
 * The play figures a level shows, reduced to the one calculation they need.
 *
 * A median rather than a mean because the clock is the page's own word
 * (docs/progress.md): one tab left open all night should not drag a level's
 * figure with it, and the middle value shrugs at outliers.
 *
 * The floor is a privacy line, not a mathematical one. A "median" of one or
 * two playthroughs is essentially those players' own times published on a
 * public page; from three, the figure is about the level. Under the floor
 * the answer is nothing, and the page draws the nothing as an em dash.
 */

/** How many qualifying playthroughs a median needs before it is anybody's. */
export const STATS_FLOOR = 3;

/** The middle of the values, or nothing while there are too few to say. */
export function medianOf(values: readonly number[]): number | undefined {
  if (values.length < STATS_FLOOR) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.floor((sorted[mid - 1]! + sorted[mid]!) / 2);
}
