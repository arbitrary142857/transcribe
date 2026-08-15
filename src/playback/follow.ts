/**
 * Which note the video is on, for the bar that follows the music.
 *
 * A search rather than a lookup, and one with a deliberate lean forward. The
 * reading it is given is never quite the moment it stands for: a mark taken
 * from a note is rounded to the millisecond, the player lands on a frame
 * boundary rather than where it was asked to, and the clock *holds* a reading
 * for the whole of a seek's settling. So a section starting exactly at a note
 * arrives here as a number a hair below that note's onset — and answering it
 * honestly meant lighting the note before, for as long as the seek took.
 */

/**
 * How far ahead of the reading an onset may sit and still count as reached.
 *
 * A frame at 25fps, which covers both the millisecond the marks are rounded to
 * and the frame the player lands on. It is a ceiling and not a rule: `snapTo`
 * below never spends more than half of the note being left, so on music this
 * number was not chosen against the halving is what decides.
 */
export const SNAP_SECONDS = 0.04;

/** The last onset at or before `seconds`, or 0 while none has passed. */
function lastBefore(onsets: readonly number[], seconds: number): number {
  let low = 0;
  let high = onsets.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (onsets[middle]! <= seconds) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * The event the reading is on, or `undefined` when there are no events.
 *
 * Outside the music is the caller's business — the marks say where the music
 * is, and this only says which of it a second falls on.
 */
export function eventAtSeconds(
  onsets: readonly number[],
  seconds: number,
): number | undefined {
  if (onsets.length === 0) return undefined;

  const index = lastBefore(onsets, seconds);
  const next = onsets[index + 1];
  if (next === undefined) return index;

  const ahead = next - seconds;
  const gap = next - onsets[index]!;
  // Half the note being left, at most: a fixed tolerance is a promise about how
  // short a note can be, and this one would be broken by a thirty-second at any
  // brisk tempo. Halving turns the constant into a ceiling, so the first half of
  // every note is always its own however short it is.
  return ahead <= Math.min(SNAP_SECONDS, gap / 2) ? index + 1 : index;
}
