import { Fraction, whole } from "../music/fraction.js";
import type { Melody } from "../music/melody.js";
import type { TimeSignature } from "../music/types.js";

const ZERO = new Fraction(0, 1);

/** How much of a whole note one bar of this meter holds. */
export function barLengthOf(meter: TimeSignature): Fraction {
  return new Fraction(meter.beats, meter.beatUnit);
}

/** Where one event sits, in whole notes from the start of the melody. */
export type EventPosition = {
  index: number;
  /** Zero-based bar holding the event's start. */
  bar: number;
  /** Position within that bar. */
  offset: Fraction;
  /** Position from the start of the melody. */
  start: Fraction;
  /** The event's own sounding length. */
  length: Fraction;
};

/** Whole bars fitting entirely before `start`. */
function barIndexOf(start: Fraction, barLength: Fraction): number {
  return Math.floor(start.divide(barLength).toNumber());
}

/**
 * Where every event begins.
 *
 * Deliberately total: an event overrunning a barline is placed in the bar it
 * starts in rather than rejected, because this is what the editor consults to
 * decide such a duration is unavailable in the first place. Refusing to
 * describe the state would leave the rule with nothing to read.
 */
export function eventPositions(melody: Melody): EventPosition[] {
  const barLength = barLengthOf(melody.timeSignature);
  const positions: EventPosition[] = [];
  let start = ZERO;

  for (let index = 0; index < melody.eventCount; index++) {
    const length = melody.getEvent(index).duration.asWholeNoteFraction();
    const bar = barIndexOf(start, barLength);
    positions.push({
      index,
      bar,
      offset: start.difference(barLength.multiply(whole(bar))),
      start,
      length,
    });
    start = start.add(length);
  }

  return positions;
}

/**
 * The event beginning exactly at `start`, if one does.
 *
 * Editing operations hold on to a position rather than an index, since
 * re-notating the rests around an edit can change how many events a stretch of
 * silence takes; the position is what stays put.
 */
export function indexAtStart(melody: Melody, start: Fraction): number | undefined {
  return eventPositions(melody).find((position) => position.start.equals(start))
    ?.index;
}

/**
 * How many bars the melody spans.
 *
 * A bar the events only partly fill still counts as a bar: this is asked of
 * melodies mid-edit, and refusing to count a half-written bar would make the
 * answer disappear exactly when something is being written into it.
 */
export function measureCountOf(melody: Melody): number {
  const total = totalLengthOf(melody);
  if (total.compare(ZERO) <= 0) {
    return 0;
  }
  return Math.ceil(total.divide(barLengthOf(melody.timeSignature)).toNumber());
}

/** How much of a whole note the melody's events fill in total. */
export function totalLengthOf(melody: Melody): Fraction {
  let total = ZERO;
  for (let index = 0; index < melody.eventCount; index++) {
    total = total.add(melody.getEvent(index).duration.asWholeNoteFraction());
  }
  return total;
}

/**
 * The event whose span covers `start`, or the last one when nothing does.
 *
 * Where `indexAtStart` asks which event begins at a point, this asks which is
 * sounding there — the question to ask after an edit, because the silence
 * around one can merge into a single longer rest and leave nothing beginning
 * where the edit did. Falling back to the last event keeps the answer inside
 * the melody even when it has grown shorter than the position asked about.
 */
export function indexCovering(
  melody: Melody,
  start: Fraction,
): number | undefined {
  const positions = eventPositions(melody);
  for (const position of positions) {
    const end = position.start.add(position.length);
    if (position.start.compare(start) <= 0 && start.compare(end) < 0) {
      return position.index;
    }
  }
  return positions.length > 0 ? positions.length - 1 : undefined;
}
