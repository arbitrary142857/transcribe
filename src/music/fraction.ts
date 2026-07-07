export interface Fraction {
  num: number;
  den: number;
}

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

export function reduce(f: Fraction): Fraction {
  let { num, den } = f;
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

export function add(a: Fraction, b: Fraction): Fraction {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  return reduce({ num, den });
}

export function compare(a: Fraction, b: Fraction): number {
  return a.num * b.den - b.num * a.den;
}

export function equals(a: Fraction, b: Fraction): boolean {
  return compare(a, b) === 0;
}
