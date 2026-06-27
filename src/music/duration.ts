import { Fraction } from "./fraction.js";
import { Tuplet } from "./tuplet.js";
import type { TimeSignature } from "./types.js";

/** Each value is the denominator of 1/n of a whole note. */
export const NoteValue = {
  Whole: 1,
  Half: 2,
  Quarter: 4,
  Eighth: 8,
  Sixteenth: 16,
  ThirtySecond: 32,
} as const;

type NoteValueType = (typeof NoteValue)[keyof typeof NoteValue];

/** VexFlow duration token for each note value. */
const VEXFLOW_DURATION: Record<NoteValueType, string> = {
  [NoteValue.Whole]: "w",
  [NoteValue.Half]: "h",
  [NoteValue.Quarter]: "q",
  [NoteValue.Eighth]: "8",
  [NoteValue.Sixteenth]: "16",
  [NoteValue.ThirtySecond]: "32",
};

export class Duration {
  constructor(
    public value: NoteValueType,
    public dots = 0,
    public tuplet: Tuplet = Tuplet.None,
  ) {
    if (!Number.isInteger(this.dots) || this.dots < 0) {
      throw new RangeError("dots must be a non-negative integer");
    }
  }

  isEqual(other: Duration): boolean {
    return (
      this.value === other.value &&
      this.dots === other.dots &&
      this.tuplet.isEqual(other.tuplet)
    );
  }

  /** Length as a fraction of a whole note, for playback timing. */
  asWholeNoteFraction(): Fraction {
    let num = 1;
    let den = this.value;
    if (this.dots > 0) {
      num *= 2 ** (this.dots + 1) - 1;
      den *= 2 ** this.dots;
    }
    return new Fraction(num, den).multiply(this.tuplet.asFraction());
  }

  /** Same sounding length, possibly with different notation. */
  sameLengthAs(other: Duration): boolean {
    return this.asWholeNoteFraction().equals(other.asWholeNoteFraction());
  }

  inSeconds(bpm: number): number {
    const { num, den } = this.asWholeNoteFraction();
    const wholeNoteSeconds = (4 * 60) / bpm;
    return (num / den) * wholeNoteSeconds;
  }

  /** VexFlow duration token for the written note value, e.g. `q` or `16`. */
  vexFlowToken(): string {
    return VEXFLOW_DURATION[this.value];
  }

  /** Written length and tuplet ratio, e.g. `/q`, `/q..`, or `/8{3:2}`. */
  toString(): string {
    const ratio = this.tuplet.isNone() ? "" : `{${this.tuplet}}`;
    return `/${this.vexFlowToken()}${".".repeat(this.dots)}${ratio}`;
  }
}

/** Written values longest first. */
const WRITTEN_VALUES: readonly NoteValueType[] = [
  NoteValue.Whole,
  NoteValue.Half,
  NoteValue.Quarter,
  NoteValue.Eighth,
  NoteValue.Sixteenth,
  NoteValue.ThirtySecond,
];

/** Augmentation dots a written value may carry. */
const MAX_DOTS = 2;

/** The shortest writable length, and so the finest grid `notateRest` accepts. */
const SMALLEST = new Fraction(1, NoteValue.ThirtySecond);

const ZERO = new Fraction(0, 1);

/**
 * The single written duration sounding exactly `length`, or `undefined` when no
 * one duration does.
 *
 * Every value-and-dots pair has a distinct length, so at most one can match.
 * Doubling as a test for whether a length is writable at all is what makes this
 * the check for a tuplet ratio: a ratio may only be offered when each member it
 * would produce has a name.
 */
export function writtenValue(length: Fraction): Duration | undefined {
  for (const value of WRITTEN_VALUES) {
    for (let dots = 0; dots <= MAX_DOTS; dots++) {
      const candidate = new Duration(value, dots);
      if (candidate.asWholeNoteFraction().equals(length)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/** Every written value and dot count, longest first. */
const ALL_WRITTEN: readonly Duration[] = WRITTEN_VALUES.flatMap((value) =>
  [2, 1, 0].map((dots) => new Duration(value, dots)),
).sort((a, b) => b.asWholeNoteFraction().compare(a.asWholeNoteFraction()));

/**
 * Write a length as durations, longest first, taking no account of meter.
 *
 * For inside a tuplet bracket, where there is no metric grid to respect: the
 * bracket's own ratio has already been divided out, so what is left has to be
 * writable without one. Rests in a bar go through `notateRest` instead, which
 * cares where the beats fall.
 */
export function writeLength(length: Fraction): Duration[] {
  if (length.compare(ZERO) < 0) {
    throw new RangeError("length must not be negative");
  }
  if (!onGrid(length)) {
    throw new RangeError(
      `Cannot write a length of ${length} without a tuplet ratio`,
    );
  }

  const written: Duration[] = [];
  let remaining = length;
  while (remaining.compare(ZERO) > 0) {
    const next = ALL_WRITTEN.find(
      (candidate) => candidate.asWholeNoteFraction().compare(remaining) <= 0,
    );
    if (!next) {
      throw new RangeError(`Cannot write a length of ${length}`);
    }
    written.push(next);
    remaining = remaining.difference(next.asWholeNoteFraction());
  }
  return written;
}

const scale = (length: Fraction, by: number) =>
  new Fraction(length.num * by, length.den);
const divide = (length: Fraction, by: number) =>
  new Fraction(length.num, length.den * by);
const minOf = (a: Fraction, b: Fraction) => (a.compare(b) <= 0 ? a : b);
const maxOf = (a: Fraction, b: Fraction) => (a.compare(b) >= 0 ? a : b);

/** Whether a length sits on the grid of writable positions. */
const onGrid = (length: Fraction) =>
  NoteValue.ThirtySecond % length.reduce().den === 0;

/**
 * A meter read as beats rather than as its printed numerator.
 *
 * The two differ exactly in compound time: 6/8 is two dotted-quarter beats, not
 * six eighths, and grouping its rests by eighths would hide the beat the meter
 * exists to show. Three at the top is simple triple — 3/8 is three beats, not
 * one compound beat — so being compound takes more than three.
 */
type Beats = { beat: Fraction; compound: boolean };

function readBeats({ beats, beatUnit }: TimeSignature): Beats {
  const compound = beats % 3 === 0 && beats > 3;
  return {
    beat: new Fraction(compound ? 3 : 1, beatUnit),
    compound,
  };
}

/**
 * How a run of `count` beats groups, for two or more.
 *
 * Even runs halve, which is what lets 4/4 take a half rest on either side of the
 * bar but never across its middle, and what gives 12/8 its dotted minim at
 * either end. Threes divide in three so every beat of a triple meter shows.
 * Anything else peels off the largest power of two, the usual reading of 5/8
 * and 7/8.
 */
function groupBeats(count: number): number[] {
  if (count % 2 === 0) return [count / 2, count / 2];
  if (count % 3 === 0) return [count / 3, count / 3, count / 3];
  const head = 2 ** Math.floor(Math.log2(count));
  return [head, count - head];
}

/** The metric children of one span, or none once it is too short to divide. */
function childSpans(
  start: Fraction,
  end: Fraction,
  beats: Beats,
): [Fraction, Fraction][] {
  const length = end.difference(start);
  if (length.compare(SMALLEST) <= 0) {
    return [];
  }

  const againstBeat = length.compare(beats.beat);
  let sizes: Fraction[];
  if (againstBeat > 0) {
    const count = (length.num * beats.beat.den) / (length.den * beats.beat.num);
    sizes = groupBeats(count).map((n) => scale(beats.beat, n));
  } else if (againstBeat === 0 && beats.compound) {
    // A compound beat's silence is a dotted rest, or a quarter rest and then an
    // eighth — so it divides two thirds and one, not into three equal parts.
    const third = divide(length, 3);
    sizes = [scale(third, 2), third];
  } else {
    sizes = [divide(length, 2), divide(length, 2)];
  }

  const spans: [Fraction, Fraction][] = [];
  let cursor = start;
  for (const size of sizes) {
    const next = cursor.add(size);
    spans.push([cursor, next]);
    cursor = next;
  }
  return spans;
}

/** Fill `[from, to)` inside the metric node `[start, end)`. */
function fill(
  from: Fraction,
  to: Fraction,
  start: Fraction,
  end: Fraction,
  beats: Beats,
): Duration[] {
  if (from.compare(to) >= 0) {
    return [];
  }

  // A span filling a whole metric node is written as one rest whenever the
  // length has a name. That is what keeps beats 3–4 of 4/4 a single half rest
  // instead of two quarters, without ever reaching across a boundary to do it.
  if (from.equals(start) && to.equals(end)) {
    const exact = writtenValue(end.difference(start));
    if (exact) {
      return [exact];
    }
  }

  const children = childSpans(start, end, beats);
  if (children.length === 0) {
    throw new RangeError(
      `Cannot write a rest of ${to.difference(from)} of a whole note`,
    );
  }

  const written: Duration[] = [];
  for (const [childStart, childEnd] of children) {
    const lo = maxOf(from, childStart);
    const hi = minOf(to, childEnd);
    if (lo.compare(hi) < 0) {
      written.push(...fill(lo, hi, childStart, childEnd, beats));
    }
  }
  return written;
}

/**
 * Write `length` of silence, starting `from` into a bar of `meter`, as the rests
 * a copyist would use.
 *
 * Length alone cannot choose the notation, because rests exist to show where the
 * beats fall: three beats of 4/4 are a half rest and a quarter from the
 * downbeat, but a quarter and a half from beat two. So the span is cut at every
 * metric boundary it crosses, coarsest first, and only a piece filling a whole
 * boundary-to-boundary node is written as one rest.
 *
 * Every duration returned sounds exactly what it says, including for a bar of
 * silence: the whole rest a copyist would draw there is a glyph standing in for
 * a bar of any length, which is the renderer's business rather than a length.
 *
 * Both `from` and `length` must sit on the grid of writable lengths, and the
 * span must stay inside one bar. A tuplet's own length never does, which is why
 * a tuplet's rests come from its ratio rather than through here.
 */
export function notateRest(
  length: Fraction,
  from: Fraction,
  meter: TimeSignature,
): Duration[] {
  if (length.compare(ZERO) < 0) {
    throw new RangeError("length must not be negative");
  }
  if (from.compare(ZERO) < 0) {
    throw new RangeError("from must not be negative");
  }
  if (!onGrid(length) || !onGrid(from)) {
    throw new RangeError(
      `Cannot write a rest of ${length} at ${from}: both must be multiples of 1/${NoteValue.ThirtySecond}`,
    );
  }

  const barLength = new Fraction(meter.beats, meter.beatUnit);
  const to = from.add(length);
  if (to.compare(barLength) > 0) {
    throw new RangeError(
      `A rest of ${length} starting at ${from} runs past the end of a ${meter.beats}/${meter.beatUnit} bar`,
    );
  }

  return fill(from, to, ZERO, barLength, readBeats(meter));
}
