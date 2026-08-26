/**
 * How hard a level is, as far as anything knows.
 *
 * The model, whole, in three sentences. A level starts at its author's
 * rating, which counts as if a few solvers had voted it. Each solver who
 * rates the level adds one vote, and the shown figure is the average of all
 * the votes, rounded to the nearest half. Whose votes count is decided when
 * the figures are read, never when they are stored: an account whose
 * share_stats is off is in no average, past ratings included.
 *
 * `displayedDifficulty` is the one function that turns what is known about a
 * level into what is shown; every drawing calls it, and nothing else knows
 * how difficulty is arrived at. Its inputs travel on the level summary --
 * the author's stars, and a count and sum of the shared ratings, aggregated
 * by the listing query at read time (see LEVEL_COLUMNS) and stored nowhere.
 * Changing the blend is changing this body; the callers and the drawing
 * stay as they are.
 *
 * The table holds every word as a count of halves, an integer, so no column
 * has to change when the display changes its mind about what a half looks
 * like. `starsOfHalf` and `halfOfStars` are the two ends of that, and
 * `DIFFICULTY` is the range and the blend's one constant in one place.
 */

export const DIFFICULTY = {
  /** The fewest halves a rating may give: half a pepper. */
  halfMin: 1,
  /** The most: five peppers. */
  halfMax: 10,
  /** How many peppers a drawing has room for. */
  stars: 5,
  /**
   * How many votes the author's word casts. Four means one solver moves the
   * figure a little, four solvers pull it even with the author, and a dozen
   * mostly own it -- and until anybody rates, the figure is the author's
   * exactly.
   */
  authorVotes: 4,
} as const;

export const starsOfHalf = (half: number): number => half / 2;

export const halfOfStars = (stars: number): number => Math.round(stars * 2);

/** Whether this is a rating somebody may give: a number of halves in range. */
export function isStars(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const half = value * 2;
  return (
    Number.isInteger(half) &&
    half >= DIFFICULTY.halfMin &&
    half <= DIFFICULTY.halfMax
  );
}

/** What a card or a box shows for the difficulty, or nothing when unrated. */
export type DisplayedDifficulty = {
  /** Peppers to fill, in halves. */
  stars: number;
  /** The number printed beside them. */
  text: string;
};

/**
 * The difficulty to show for this level.
 *
 * The author's word counted `authorVotes` times, each shared rating counted
 * once, averaged, and rounded to the nearest half *before* either field is
 * made -- the text and the drawing must be the same number, so the rounding
 * happens exactly once, here.
 *
 * Nothing without the author's word: a published level always has one (the
 * publish route insists, and 0006 backfilled the stragglers), so this is
 * only ever a draft, whose card simply shows no difficulty.
 */
export function displayedDifficulty(level: {
  authorDifficulty?: number | undefined;
  ratingCount?: number | undefined;
  ratingHalves?: number | undefined;
}): DisplayedDifficulty | undefined {
  const author = level.authorDifficulty;
  if (author === undefined) return undefined;

  const halves =
    (DIFFICULTY.authorVotes * halfOfStars(author) + (level.ratingHalves ?? 0)) /
    (DIFFICULTY.authorVotes + (level.ratingCount ?? 0));
  const stars = Math.round(halves) / 2;
  // One decimal always -- "1.5", "4.0" -- so the printed figures line up
  // from card to card.
  return { stars, text: stars.toFixed(1) };
}
