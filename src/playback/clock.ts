/**
 * Where the video has got to, between the player's own answers.
 *
 * Measured against the real player, `getCurrentTime()` turns out to be a live
 * read of the media clock — it moves every animation frame and sits within a
 * millisecond or two of a straight line, and a seek made while paused reads back
 * exactly. So this is not the drift-correcting filter such a thing usually has
 * to be. It carries two much smaller jobs:
 *
 * - Covering a reading that has not moved. This player never needs it; a
 *   coarser one, on another browser or another day, would repeat its answer
 *   between updates, and counting on from where that answer was first given
 *   beats restarting at it over and over.
 * - Saying when the video jumped, which is the only thing the metronome needs
 *   to know in order to drop clicks it has already scheduled.
 */
export type ClockState = {
  /** The last reading that was new, in video seconds. */
  readonly reading: number;
  /** `performance.now()` when that reading was first seen. */
  readonly wall: number;
  readonly rate: number;
  readonly playing: boolean;
  /**
   * Until when the clock treats what it sees as a seek still landing.
   *
   * After any seek the reading freezes for a few hundred milliseconds while
   * the pipeline catches up, then snaps forward. Extrapolating through the
   * freeze runs ahead of reality by the stall times the rate — which is what
   * made fast playback misread its own loop wraps as somebody scrubbing — so
   * while settling the clock holds instead, and takes the snap that ends the
   * freeze as the seek finishing rather than as a second seek.
   */
  readonly settleUntil?: number;
};

/** What the player says right now. */
export type ClockSample = {
  readonly wall: number;
  readonly reading: number;
  readonly rate: number;
  readonly playing: boolean;
};

/**
 * How far a reading may run ahead of or behind its expectation before it is a
 * jump rather than jitter. Forwards is the direction playback itself goes, so
 * the threshold there is generous.
 */
export const JUMP_SECONDS = 0.25;

/**
 * How far a reading may sit *behind* its expectation before it is a jump.
 *
 * Much tighter than the forward threshold, because the reading never runs
 * backwards on its own — measured jitter is a few milliseconds, so thirty is
 * six times clear of noise while still seeing the smallest wrap a loop over a
 * sixteenth note makes.
 */
export const BACKWARD_SECONDS = 0.03;

/** How long a seek is given to finish landing. */
export const SETTLE_MS = 800;

/**
 * How far the snap ending a seek's settling may sit from where the seek
 * landed and still be the same seek. Anything further is a scrub that
 * happened to land mid-settle.
 */
export const ABSORB_SECONDS = 1.5;

export const startedClock = (sample: ClockSample): ClockState => ({
  reading: sample.reading,
  wall: sample.wall,
  rate: sample.rate,
  playing: sample.playing,
});

/** Video seconds at `wall`, counting on from the last reading that was new. */
export function readClock(state: ClockState, wall: number): number {
  if (!state.playing) {
    return state.reading;
  }
  return state.reading + ((wall - state.wall) / 1000) * state.rate;
}

/**
 * Take in what the player says, and report how the video changed.
 *
 * A reading identical to the last one is treated as the same reading rather than
 * a new one, so the anchor stays where it was and the clock keeps counting
 * through it.
 *
 * Two findings come back, because two different things listen for them:
 * `moved` is a seek — the reading itself is somewhere it could not have got to
 * by playing — and is what tells section playback the scrubber was touched.
 * `jumped` is any break in continuity at all, seeks included but also pauses
 * and changes of speed, and is what tells the metronome to drop the clicks it
 * had lined up.
 */
export function sampleClock(
  state: ClockState,
  sample: ClockSample,
): { state: ClockState; jumped: boolean; moved: boolean } {
  // A repeated reading is not news: it naturally lags the extrapolation, so it
  // must be recognised before the seek test, or every repeat would read as a
  // little seek backwards.
  const repeat = sample.reading === state.reading;
  const settling =
    state.settleUntil !== undefined && sample.wall <= state.settleUntil;

  const expected = readClock(state, sample.wall);
  const moved = repeat
    ? false
    : settling
      ? // The snap that ends a seek's settling is the seek finishing, not a
        // second seek — unless it lands somewhere else entirely.
        Math.abs(sample.reading - state.reading) > ABSORB_SECONDS
      : expected - sample.reading > BACKWARD_SECONDS ||
        Math.abs(sample.reading - expected) > JUMP_SECONDS;
  const jumped =
    moved ||
    sample.playing !== state.playing ||
    sample.rate !== state.rate;

  // A repeat while settling holds the clock — the media truly is stalled — by
  // walking the anchor forward. A repeat outside settling keeps the old
  // anchor, so a coarse player's gaps are extrapolated through, not lost.
  const anchorWall = repeat && !jumped && !settling ? state.wall : sample.wall;

  return {
    jumped,
    moved,
    state: {
      reading: sample.reading,
      wall: anchorWall,
      rate: sample.rate,
      playing: sample.playing,
      // A seek opens a settling window, and so does starting or stopping —
      // the pipeline stalls the reading the same way while it spins up — and
      // an ordinary fresh reading closes whatever window was open.
      settleUntil:
        moved || sample.playing !== state.playing
          ? sample.wall + SETTLE_MS
          : repeat
            ? state.settleUntil
            : undefined,
    },
  };
}
