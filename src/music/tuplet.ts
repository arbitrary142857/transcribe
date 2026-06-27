import { Fraction } from "./fraction.js";

export class Tuplet {
  /** The absence of a tuplet: one note in the time of one. */
  static readonly None = new Tuplet(1, 1);
  /** Three notes in the time of two. */
  static readonly Triplet = new Tuplet(3, 2);
  /** Five notes in the time of four. */
  static readonly Quintuplet = new Tuplet(5, 4);

  constructor(
    public readonly numNotes: number,
    public readonly inTimeOf: number,
  ) {
    if (!Number.isInteger(this.numNotes) || this.numNotes < 1) {
      throw new RangeError("numNotes must be a positive integer");
    }
    if (!Number.isInteger(this.inTimeOf) || this.inTimeOf < 1) {
      throw new RangeError("inTimeOf must be a positive integer");
    }
  }

  /** Whether this ratio leaves the written duration unchanged. */
  isNone(): boolean {
    return this.numNotes === this.inTimeOf;
  }

  /** Factor applied to a written duration to get its sounding length. */
  asFraction(): Fraction {
    return new Fraction(this.inTimeOf, this.numNotes).reduce();
  }

  isEqual(other: Tuplet): boolean {
    return this.numNotes === other.numNotes && this.inTimeOf === other.inTimeOf;
  }

  /** Ratio as VexFlow prints it on the bracket, e.g. `3:2`. */
  toString(): string {
    return `${this.numNotes}:${this.inTimeOf}`;
  }
}

/** A run of `count` consecutive events sharing one tuplet bracket. */
export type TupletSpan = {
  start: number;
  count: number;
  tuplet: Tuplet;
};
