import { barLengthOf } from "../editor/position.js";
import { beatLengthOf } from "../music/duration.js";
import type { TimeSignature } from "../music/types.js";

/**
 * The two moments the user marked, in video seconds.
 *
 * Video seconds, not wall-clock seconds: the video's own timeline does not care
 * how fast it is being played, so a mark taken at half speed still names the
 * same moment of the music. That is what keeps the speed slider out of every
 * calculation below.
 */
export type Marks = { readonly start: number; readonly end: number };

/** One click of the metronome. */
export type Beat = {
  /** Beats from the head of the first bar; negative before it. */
  readonly index: number;
  readonly seconds: number;
  /** The first beat of a bar. */
  readonly accented: boolean;
};

/** Musical time pinned to video time, at one steady tempo. */
export type TempoMap = {
  readonly start: number;
  readonly end: number;
  /** Bars of music between the marks. */
  readonly bars: number;
  /** Whole notes in one bar. */
  readonly barLength: number;
  /** Clicks in one bar — the beat a player feels, so 6/8 gets two. */
  readonly beatsPerBar: number;
};

const isReal = (value: number) => Number.isFinite(value);

/**
 * The beats a player feels in one bar of `meter`.
 *
 * The felt beat, not the written one: 6/8 is counted in two dotted quarters
 * rather than six eighths, which is what a conductor beats and what the
 * metronome clicks.
 *
 * Lives here beside `TempoMap.beatsPerBar`, which is the same number, because
 * the tempo has to be judged before a map exists — the setup page and the
 * editor both gate on it — and two copies of this arithmetic would be two
 * things to keep agreeing.
 */
export const beatsPerBarOf = (meter: TimeSignature): number =>
  barLengthOf(meter).divide(beatLengthOf(meter)).toNumber();

/**
 * Read a tempo out of two marks and the bars between them.
 *
 * Returns nothing rather than a broken map when the marks cannot describe a
 * tempo — no music to measure, or an end that does not come after its start.
 * Everything downstream is gated on having one, so this is also what keeps the
 * metronome and the playhead switched off until they can be right.
 */
export function tempoMapOf(
  marks: Marks,
  bars: number,
  meter: TimeSignature,
): TempoMap | undefined {
  if (bars <= 0 || !isReal(marks.start) || !isReal(marks.end)) {
    return undefined;
  }
  if (marks.end <= marks.start) {
    return undefined;
  }
  const barLength = barLengthOf(meter);
  return {
    start: marks.start,
    end: marks.end,
    bars,
    barLength: barLength.toNumber(),
    beatsPerBar: barLength.divide(beatLengthOf(meter)).toNumber(),
  };
}

/** Whole notes of music between the two marks. */
const span = (map: TempoMap) => map.bars * map.barLength;

/** How long one click lasts, in video seconds. */
export const beatSeconds = (map: TempoMap): number =>
  (map.end - map.start) / (map.bars * map.beatsPerBar);

/**
 * When a moment of the music happens, in video seconds.
 *
 * Extends past either mark rather than stopping at them: the tempo is a
 * straight line and there is no reason to refuse to read it beyond the two
 * points it was drawn through.
 */
export function secondsAtPosition(map: TempoMap, wholes: number): number {
  return map.start + (wholes / span(map)) * (map.end - map.start);
}

/** Which moment of the music a video second falls on. */
export function positionAtSeconds(map: TempoMap, seconds: number): number {
  return ((seconds - map.start) / (map.end - map.start)) * span(map);
}

/** The tempo, counted in the beat the metronome actually clicks. */
export function beatsPerMinute(map: TempoMap): number {
  return 60 / beatSeconds(map);
}

/** Positive remainder, so a beat before the start mark still knows its place. */
const mod = (a: number, b: number) => ((a % b) + b) % b;

/**
 * Every click falling in `[from, to)` of video time.
 *
 * Half-open, so two windows meeting at a beat never sound it twice — which is
 * the whole reason the scheduler can ask for one window after another without
 * keeping track of what it has already played.
 */
export function beatsBetween(
  map: TempoMap,
  from: number,
  to: number,
): Beat[] {
  if (!(to > from) || !isReal(from) || !isReal(to)) {
    return [];
  }
  const period = beatSeconds(map);
  const first = Math.ceil((from - map.start) / period);
  const last = Math.ceil((to - map.start) / period) - 1;

  const beats: Beat[] = [];
  for (let index = first; index <= last; index++) {
    beats.push({
      index,
      seconds: map.start + index * period,
      accented: mod(index, map.beatsPerBar) === 0,
    });
  }
  return beats;
}
