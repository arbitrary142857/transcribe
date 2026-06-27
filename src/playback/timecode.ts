/**
 * Times as people write them.
 *
 * The fields show `2:12.893` where the state holds `132.893`: seconds are what
 * the arithmetic wants and minutes are what a person reading a video timeline
 * wants, and the two must never disagree — so every write is quantized to the
 * millisecond, which is exactly what the format can show.
 */

/** Seconds to the millisecond, which is as fine as the format goes. */
export const toMilliseconds = (seconds: number): number =>
  Math.round(seconds * 1000) / 1000;

/**
 * `H:MM:SS.SSS`, with the hours only when there are hours.
 *
 * A sub-minute time keeps its zero minute — `0:12.893` — so a glance always
 * finds the seconds in the same place.
 */
export function formatTimecode(seconds: number): string {
  const total = Math.round(seconds * 1000);
  const ms = total % 1000;
  const wholeSeconds = (total - ms) / 1000;
  const s = wholeSeconds % 60;
  const wholeMinutes = (wholeSeconds - s) / 60;
  const m = wholeMinutes % 60;
  const h = (wholeMinutes - m) / 60;

  const tail = `${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${tail}`
    : `${m}:${tail}`;
}

/**
 * Read a typed time, or nothing if it is not one.
 *
 * Both `2:12.893` and `132.893` are accepted, because both are how people
 * write times; the display settles on the first form afterwards. Sixty or more
 * in a field is refused when something stands above it — `1:90` is not a time
 * anyone means — but bare seconds may run as high as they like.
 */
export function parseTimecode(text: string): number | undefined {
  const trimmed = text.trim();
  const match =
    /^(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const [, hours, minutes, seconds] = match;
  const s = Number(seconds);
  const m = Number(minutes ?? 0);
  if (minutes !== undefined && s >= 60) return undefined;
  if (hours !== undefined && m >= 60) return undefined;
  return toMilliseconds(Number(hours ?? 0) * 3600 + m * 60 + s);
}
