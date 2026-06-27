import { Fraction } from "./fraction.js";
import { Tuplet } from "./tuplet.js";

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
