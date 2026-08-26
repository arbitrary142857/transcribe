/**
 * Which levels the catalog shows: by where the visitor got to on them, and
 * by how hard they are.
 *
 * Two independent cuts, ANDed by the list. The progress rule has three
 * buckets a level can be in for one person, and a fourth choice that is all
 * of them, decided from the progress record alone so the same rule serves a
 * browser's records and an account's. The heat rule is a range of halves
 * over the *blended* figure — `displayedDifficulty`'s, never the author's
 * word alone — so the filter and the peppers on the card cannot disagree.
 *
 * Pure: the controls that offer the choices live in `segmented.ts` and
 * `heat-range.ts`, and the list that redraws itself is `level-list.ts`.
 * Nothing here is remembered between visits, unlike the Compact preference —
 * a filter is a question asked now, not a way of liking the page.
 *
 * When the catalog one day loads its levels a page at a time, these rules
 * stop being enough on their own: a cut applied to the loaded prefix is not
 * a cut applied to the catalog, and the rules will have to ride the query or
 * re-run per page. They are pure functions so that they can move.
 */

import type { PlayProgress } from "../puzzle/progress.js";
import { DIFFICULTY, displayedDifficulty, starsOfHalf } from "../shared/difficulty.js";

export type ProgressFilter = "all" | "unplayed" | "started" | "solved";

export type ProgressBucket = Exclude<ProgressFilter, "all">;

export const FILTERS: readonly { value: ProgressFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unplayed", label: "Unplayed" },
  { value: "started", label: "In progress" },
  { value: "solved", label: "Solved" },
];

/**
 * Solved if it has been solved; started if anything is written on the stave;
 * unplayed otherwise. Opening a level and closing it again leaves a record
 * with the clock run and nothing written, and that is not having started.
 */
export function bucketOf(progress: PlayProgress | undefined): ProgressBucket {
  if (progress === undefined) return "unplayed";
  if (progress.solvedAt !== undefined) return "solved";
  return progress.pitches.length > 0 ? "started" : "unplayed";
}

/** The ones to draw, in the order given. */
export function filterLevels<T extends { progress?: PlayProgress | undefined }>(
  showing: readonly T[],
  filter: ProgressFilter,
): T[] {
  return filter === "all"
    ? [...showing]
    : showing.filter((each) => bucketOf(each.progress) === filter);
}

/**
 * What to say when a filter leaves nothing. Nothing for "all": an empty
 * catalog is the list's own to explain.
 */
export function emptyFilterSentence(filter: ProgressFilter): string | undefined {
  switch (filter) {
    case "all":
      return undefined;
    case "unplayed":
      return "Every level has been started.";
    case "started":
      return "Nothing is in progress.";
    case "solved":
      return "Nothing solved yet.";
  }
}

// ---- the heat rule --------------------------------------------------------

/** Both ends of the difficulty cut, in stars, inclusive. */
export type HeatRange = { min: number; max: number };

/** The range that cuts nothing: the control's starting position. */
export const WHOLE_SCALE: HeatRange = {
  min: starsOfHalf(DIFFICULTY.halfMin),
  max: starsOfHalf(DIFFICULTY.halfMax),
};

/** Every value an end of the range may take, for the two selects. */
export const HEAT_STOPS: readonly number[] = Array.from(
  { length: DIFFICULTY.halfMax - DIFFICULTY.halfMin + 1 },
  (_unused, at) => starsOfHalf(DIFFICULTY.halfMin + at),
);

const isWholeScale = (range: HeatRange): boolean =>
  Math.min(range.min, range.max) <= WHOLE_SCALE.min &&
  Math.max(range.min, range.max) >= WHOLE_SCALE.max;

/**
 * The ones inside the range, ends included, judged by the blended figure.
 *
 * Swapped ends are put back in order rather than obeyed: a range nothing
 * could ever be in is not a thing anybody means. A level with no figure — a
 * draft whose author never rated it — is kept only while the range is the
 * whole scale, because a level that says nothing cannot be said to sit
 * inside a narrowed one.
 */
export function filterByHeat<
  T extends {
    level: {
      authorDifficulty?: number | undefined;
      ratingCount?: number | undefined;
      ratingHalves?: number | undefined;
    };
  },
>(showing: readonly T[], range: HeatRange): T[] {
  if (isWholeScale(range)) return [...showing];
  const min = Math.min(range.min, range.max);
  const max = Math.max(range.min, range.max);
  return showing.filter((each) => {
    const displayed = displayedDifficulty(each.level);
    return displayed !== undefined && displayed.stars >= min && displayed.stars <= max;
  });
}

/**
 * What to say when the two cuts together leave nothing: whichever filter is
 * narrowed gets to explain itself, and when both are, neither can claim to
 * know which one bit.
 */
export function emptySentence(
  filter: ProgressFilter,
  range: HeatRange,
): string | undefined {
  const heat = isWholeScale(range) ? undefined : "Nothing at that difficulty.";
  const progress = emptyFilterSentence(filter);
  if (heat !== undefined && progress !== undefined) {
    return "No levels match the filters.";
  }
  return heat ?? progress;
}
