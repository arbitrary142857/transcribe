import assert from "node:assert/strict";

export function approxEqual(
  actual: number,
  expected: number,
  epsilon = 1e-9,
): void {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${expected}, got ${actual}`,
  );
}
