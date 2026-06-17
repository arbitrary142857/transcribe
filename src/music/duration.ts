/** Each value is the denominator of 1/n of a whole note. */
export const NoteValue = {
  Whole: 1,
  Half: 2,
  HalfTriplet: 3,
  Quarter: 4,
  QuarterTriplet: 6,
  Eighth: 8,
  EighthTriplet: 12,
  Sixteenth: 16,
  SixteenthTriplet: 24,
  ThirtySecond: 32,
} as const;

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function normalizeFraction(num: number, den: number): { num: number; den: number } {
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

export class Duration {
  constructor(
    public value: (typeof NoteValue)[keyof typeof NoteValue],
    public dots = 0,
  ) {
    if (!Number.isInteger(this.dots) || this.dots < 0) {
      throw new RangeError("dots must be a non-negative integer");
    }
  }

  isEqual(other: Duration): boolean {
    return this.value === other.value && this.dots === other.dots;
  }

  /** Length as a fraction of a whole note, for playback timing. */
  asWholeNoteFraction(): { readonly num: number; readonly den: number } {
    let num = 1;
    let den = this.value;
    if (this.dots > 0) {
      num *= 2 ** (this.dots + 1) - 1;
      den *= 2 ** this.dots;
    }
    return normalizeFraction(num, den);
  }

  /** Same sounding length, possibly with different notation. */
  sameLengthAs(other: Duration): boolean {
    const a = this.asWholeNoteFraction();
    const b = other.asWholeNoteFraction();
    return a.num * b.den === b.num * a.den;
  }

  inSeconds(bpm: number): number {
    const { num, den } = this.asWholeNoteFraction();
    const wholeNoteSeconds = (4 * 60) / bpm;
    return (num / den) * wholeNoteSeconds;
  }
}
