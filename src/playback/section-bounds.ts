/**
 * Which gap between notes a section mark stands in.
 *
 * The two marks under the video are seconds of video, and the bracket drawn
 * for each has to stand somewhere on the stave. It cannot stand *on* a note —
 * a mark is a boundary, not a note — so what it needs is the gap, and there
 * are one more gaps than there are events: before the first, between each
 * pair, and after the last.
 *
 * Snapping to a gap rather than asking which note is sounding is the whole
 * point. "Set end from this note" writes the moment the note *stops*, which is
 * the same moment the next one starts — so asking what is sounding then
 * answers with the note after, and the bracket would close one note too late.
 * The gap between them is the one answer that is right from either side.
 */

/**
 * The moments that separate the events: every onset, then the last end.
 *
 * Gap `b` is before event `b`, and the last gap is after the last event, so
 * `n` events give `n + 1` of them. Silence gives none: there is no music for a
 * bracket to stand against.
 */
export function boundaryTimes(
  onsets: readonly number[],
  ends: readonly number[],
): number[] {
  if (onsets.length === 0) return [];
  const last = ends[ends.length - 1];
  return last === undefined ? [...onsets] : [...onsets, last];
}

/**
 * The gap a moment is nearest to, rounding outwards to the closest one when
 * the moment is outside the music altogether.
 *
 * The earlier gap wins a dead tie. Nothing depends on which way it goes, but
 * something depends on it going the same way every time: a mark sitting exactly
 * between two gaps must not pick a different one each redraw.
 */
export function nearestBoundary(
  times: readonly number[],
  seconds: number,
): number | undefined {
  if (times.length === 0) return undefined;

  let nearest = 0;
  let distance = Math.abs(times[0]! - seconds);
  for (let index = 1; index < times.length; index++) {
    const away = Math.abs(times[index]! - seconds);
    // Strictly closer, so a tie leaves the earlier one standing.
    if (away < distance) {
      nearest = index;
      distance = away;
    }
  }
  return nearest;
}
