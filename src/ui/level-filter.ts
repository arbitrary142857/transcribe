/**
 * Which levels a list shows.
 *
 * Four independent cuts on the catalog, ANDed: the statuses a visitor has
 * reached on a level, a range of difficulty, whether they hearted it, and
 * whether it is their own. One cut on the author's own page: which kind of
 * work a level is. Each is decided from a record or a column, never from a
 * melody, so the same rule serves a browser's progress and an account's.
 *
 * The status cuts are a set of switches rather than one choice of four,
 * because "everything except what I have finished" is a thing to want and a
 * one-of-four control cannot say it. Turning every switch off shows nothing,
 * which is what was asked for; it is not read as "no cut made".
 *
 * Pure: the controls that offer the choices live in `level-filters.ts` and
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
import type { LevelStatus } from "../shared/transcription.js";

// ---- what a level is, to a visitor and to its author ----------------------

export type ProgressBucket = "unplayed" | "started" | "solved";

export type WorkBucket = "unfinished" | "complete" | "published";

/** Whether each bucket is shown. Every one of them off shows nothing. */
export type Chosen<K extends string> = Record<K, boolean>;

/**
 * The switches, in the order they are drawn, worded exactly as the cards
 * word them — a filter that said "Solved" beside cards that say
 * "Transcribed" would be two names for one thing.
 */
export const PLAY_STATUSES: readonly { value: ProgressBucket; label: string }[] = [
  { value: "unplayed", label: "Not Started" },
  { value: "started", label: "In Progress" },
  { value: "solved", label: "Transcribed" },
];

export const WORK_STATUSES: readonly { value: WorkBucket; label: string }[] = [
  { value: "unfinished", label: "Unfinished" },
  { value: "complete", label: "Complete" },
  { value: "published", label: "Published" },
];

export const ALL_PLAY_STATUSES: Chosen<ProgressBucket> = {
  unplayed: true,
  started: true,
  solved: true,
};

export const ALL_WORK_STATUSES: Chosen<WorkBucket> = {
  unfinished: true,
  complete: true,
  published: true,
};

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

/** The same question asked of the work rather than of the play. */
export function workBucketOf(level: {
  status: LevelStatus;
  unpitchedCount: number;
}): WorkBucket {
  if (level.status === "published") return "published";
  return level.unpitchedCount > 0 ? "unfinished" : "complete";
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

// ---- the catalog ----------------------------------------------------------

/** Everything the catalog's filter box holds, in one value. */
export type CatalogFilter = {
  statuses: Chosen<ProgressBucket>;
  heat: HeatRange;
  /** Only the levels this viewer has hearted. */
  heartedOnly: boolean;
  /** Whether the viewer's own levels are among everybody else's. */
  showOwn: boolean;
};

/** Every cut wide open: how the box opens, and how the page starts. */
export const WHOLE_CATALOG: CatalogFilter = {
  statuses: ALL_PLAY_STATUSES,
  heat: WHOLE_SCALE,
  heartedOnly: false,
  showOwn: true,
};

/**
 * What the page knows about the viewer that a filter needs: which levels
 * they have hearted (from `/api/me/upvotes`) and who they are. Both are
 * absent for somebody signed out, and the two cuts that need them then
 * simply have nothing to bite on.
 */
export type CatalogView = {
  hearted: ReadonlySet<string>;
  viewerId: string | undefined;
};

type Listed = {
  level: {
    id: string;
    ownerId: string;
    authorDifficulty?: number | undefined;
    ratingCount?: number | undefined;
    ratingHalves?: number | undefined;
  };
  progress?: PlayProgress | undefined;
};

/** The ones to draw, in the order given. */
export function filterCatalog<T extends Listed>(
  showing: readonly T[],
  filter: CatalogFilter,
  view: CatalogView,
): T[] {
  const kept = filterByHeat(showing, filter.heat).filter((each) => {
    if (!filter.statuses[bucketOf(each.progress)]) return false;
    if (filter.heartedOnly && !view.hearted.has(each.level.id)) return false;
    // Nobody signed out has levels of their own, so this cut passes everything.
    if (!filter.showOwn && view.viewerId !== undefined) {
      return each.level.ownerId !== view.viewerId;
    }
    return true;
  });
  return kept;
}

const allOn = <K extends string>(chosen: Chosen<K>): boolean =>
  Object.values(chosen).every(Boolean);

/**
 * What to say when the cuts together leave nothing.
 *
 * Whichever cut is the only one narrowed gets to explain itself; when
 * several are, none of them can claim to know which one bit, so the box as a
 * whole takes the blame. Nothing at all when no cut was made: an empty
 * catalog is the list's own to explain.
 */
export function catalogEmptySentence(filter: CatalogFilter): string | undefined {
  const said: string[] = [];
  if (!allOn(filter.statuses)) said.push("No tunes are at those statuses.");
  if (!isWholeScale(filter.heat)) said.push("Nothing at that difficulty.");
  if (filter.heartedOnly) said.push("You have not hearted any of these tunes.");
  if (!filter.showOwn) said.push("Only your own tunes are here.");

  if (said.length === 0) return undefined;
  return said.length === 1 ? said[0] : "No tunes match the filters.";
}

// ---- the author's own page ------------------------------------------------

export function filterWork<
  T extends { level: { status: LevelStatus; unpitchedCount: number } },
>(showing: readonly T[], statuses: Chosen<WorkBucket>): T[] {
  return showing.filter((each) => statuses[workBucketOf(each.level)]);
}

export function workEmptySentence(
  statuses: Chosen<WorkBucket>,
): string | undefined {
  return allOn(statuses)
    ? undefined
    : "Nothing of yours is at those statuses.";
}
