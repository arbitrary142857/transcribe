/**
 * How hard a level is, as far as anything currently knows.
 *
 * Today that is the author's word alone: half a star to five, in halves, set
 * beside the title and the instructions. Phase 6 will have play data too —
 * how many checks a solve takes, how long — and the number a card shows will
 * be some blend of the two, decided then. What this file settles now is
 * *where* that decision lives: `displayedDifficulty` is the one function that
 * turns what is known about a level into what is shown, every drawing calls
 * it, and nothing else knows how difficulty is arrived at. Changing the
 * blend is changing its body.
 *
 * The table holds the author's word as a count of halves, an integer, so the
 * column never has to change when the display changes its mind about what a
 * half-star looks like. `starsOfHalf` and `halfOfStars` are the two ends of
 * that, and `DIFFICULTY` is the range in one place.
 */

export const DIFFICULTY = {
  /** The fewest halves the author may give: half a star. */
  halfMin: 1,
  /** The most: five stars. */
  halfMax: 10,
  /** How many stars a drawing has room for. */
  stars: 5,
} as const;

export const starsOfHalf = (half: number): number => half / 2;

export const halfOfStars = (stars: number): number => Math.round(stars * 2);

/** Whether this is a rating the author may give: a number of halves in range. */
export function isStars(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const half = value * 2;
  return (
    Number.isInteger(half) &&
    half >= DIFFICULTY.halfMin &&
    half <= DIFFICULTY.halfMax
  );
}

/** What a card, a box or a bar shows for the difficulty, or nothing when unrated. */
export type DisplayedDifficulty = {
  /** Stars to light, in halves. */
  stars: number;
  /** The number printed beside them. */
  text: string;
};

/**
 * The difficulty to show for this level.
 *
 * The author's word, for now, and its text as written ("2.5", "4"). When
 * play data joins it, this is the body to rewrite; the callers and the
 * drawing stay as they are.
 */
export function displayedDifficulty(level: {
  authorDifficulty?: number | undefined;
}): DisplayedDifficulty | undefined {
  const stars = level.authorDifficulty;
  if (stars === undefined) return undefined;
  return { stars, text: String(stars) };
}
