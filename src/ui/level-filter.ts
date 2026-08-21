/**
 * Which levels the catalog shows, by where the visitor got to on them.
 *
 * Three buckets a level can be in for one person, and a fourth choice that is
 * all of them. Decided from the progress record alone, so the same rule
 * serves a browser's records and an account's.
 *
 * Pure: the control that offers the choice is `segmented.ts`, and the list
 * that redraws itself is `level-list.ts`. Nothing here is remembered between
 * visits, unlike the Compact preference — a filter is a question asked now,
 * not a way of liking the page.
 */

import type { PlayProgress } from "../puzzle/progress.js";

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
