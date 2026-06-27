/** Greatest common divisor; always returns a non-negative integer. */
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/** `n` as a fraction, for the many places a length is scaled by a whole number. */
export const whole = (n: number): Fraction => new Fraction(n, 1);

export class Fraction {
  constructor(
    public readonly num: number,
    public readonly den: number,
  ) {}

  /** Returns this fraction reduced to lowest terms with a positive denominator. */
  reduce(): Fraction {
    let { num, den } = this;
    if (den < 0) {
      num = -num;
      den = -den;
    }
    const g = gcd(num, den);
    return new Fraction(num / g, den / g);
  }

  add(other: Fraction): Fraction {
    return new Fraction(
      this.num * other.den + other.num * this.den,
      this.den * other.den,
    ).reduce();
  }

  multiply(other: Fraction): Fraction {
    return new Fraction(
      this.num * other.num,
      this.den * other.den,
    ).reduce();
  }

  /**
   * Returns this ÷ other, reduced.
   *
   * Read as "how many of `other` fit in this", which is the question most of the
   * callers are actually asking: how many beats to a bar, how many triplet
   * eighths to a quarter.
   */
  divide(other: Fraction): Fraction {
    return new Fraction(
      this.num * other.den,
      this.den * other.num,
    ).reduce();
  }

  /** Returns this − other, reduced. */
  difference(other: Fraction): Fraction {
    return new Fraction(
      this.num * other.den - other.num * this.den,
      this.den * other.den,
    ).reduce();
  }

  /** Negative if this < other, 0 if equal, positive if this > other. */
  compare(other: Fraction): number {
    return this.num * other.den - other.num * this.den;
  }

  equals(other: Fraction): boolean {
    return this.compare(other) === 0;
  }

  /**
   * The value as a plain number.
   *
   * Everything musical is kept exact — a triplet eighth is 1/12, not 0.08333 —
   * so this is the one-way door out to wall-clock seconds and screen pixels,
   * where a float is what is wanted anyway.
   */
  toNumber(): number {
    return this.num / this.den;
  }

  toString(): string {
    const { num, den } = this.reduce();
    return `${num}/${den}`;
  }
}
