/**
 * How long a puzzle has been worked on.
 *
 * Counted only while the tab is showing. Somebody who switches away to look
 * something up is not transcribing, and a clock that ran through it would
 * punish leaving the page open — which, since the video lives on this page, is
 * the ordinary way to work.
 *
 * The other half of that is worth saying plainly: switching tabs is therefore
 * free thinking time. Nothing here prevents it, and nothing should until times
 * are being compared between people — at which point the timer stops being the
 * page's to keep at all and moves behind the check route with everything else
 * a score depends on.
 *
 * Pure over wall readings handed in, the way `clock.ts` takes its samples, so
 * a test can move an hour without waiting for one.
 */
export type Stopwatch = {
  /** Milliseconds already counted, from stretches that have ended. */
  readonly countedMs: number;
  /** When the running stretch began, or nothing while it is paused. */
  readonly since: number | undefined;
};

/**
 * A watch running from `countedMs`.
 *
 * `countedMs` is what a reload restored, and zero for a puzzle opened fresh —
 * so the same call serves both and neither has to know which it is.
 */
export const startedStopwatch = (
  countedMs: number,
  wall: number,
): Stopwatch => ({ countedMs, since: wall });

export const readStopwatch = (watch: Stopwatch, wall: number): number =>
  watch.since === undefined
    ? watch.countedMs
    : watch.countedMs + (wall - watch.since);

/**
 * Stop counting, keeping what was counted.
 *
 * Pausing something already paused is the same as not pausing it. That is not
 * defensive coding for its own sake: a tab reports itself gone more than once
 * — a blur arriving behind a visibilitychange — and a second pause that read
 * `since` as still running would count the hidden stretch it was meant to
 * exclude.
 */
export const pauseStopwatch = (watch: Stopwatch, wall: number): Stopwatch =>
  watch.since === undefined
    ? watch
    : { countedMs: readStopwatch(watch, wall), since: undefined };

/**
 * Start counting again.
 *
 * Resuming something already running leaves it alone, for the mirror of the
 * reason above: moving `since` forward would silently drop the stretch since
 * it was last set.
 */
export const resumeStopwatch = (watch: Stopwatch, wall: number): Stopwatch =>
  watch.since === undefined ? { ...watch, since: wall } : watch;

/**
 * `4:12`, and `1:04:12` once there is an hour to show.
 *
 * Rounded down, because a clock that reads 4:12 has been running four minutes
 * and twelve seconds — not up to thirteen.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);

  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
