import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Fraction } from "../dist/music/fraction.js";

describe("Fraction", () => {
  it("reduce()", () => {
    assert.deepEqual(new Fraction(2, 4).reduce(), new Fraction(1, 2));
    assert.deepEqual(new Fraction(6, 9).reduce(), new Fraction(2, 3));
  });

  it("reduce(): enforces positive denominator", () => {
    assert.deepEqual(new Fraction(1, -2).reduce(), new Fraction(-1, 2));
    assert.deepEqual(new Fraction(-2, -4).reduce(), new Fraction(1, 2));
  });

  it("add()", () => {
    assert.deepEqual(
      new Fraction(1, 2).add(new Fraction(1, 3)),
      new Fraction(5, 6),
    );
    assert.deepEqual(
      new Fraction(1, 4).add(new Fraction(1, 4)),
      new Fraction(1, 2),
    );
  });

  it("difference()", () => {
    assert.deepEqual(
      new Fraction(3, 4).difference(new Fraction(1, 2)),
      new Fraction(1, 4),
    );
    assert.deepEqual(
      new Fraction(5, 6).difference(new Fraction(1, 3)),
      new Fraction(1, 2),
    );
  });

  it("compare()", () => {
    assert.ok(new Fraction(1, 4).compare(new Fraction(1, 2)) < 0);
    assert.equal(new Fraction(3, 4).compare(new Fraction(3, 4)), 0);
    assert.equal(new Fraction(1, 2).compare(new Fraction(2, 4)), 0);
    assert.ok(new Fraction(3, 4).compare(new Fraction(1, 2)) > 0);
  });

  it("equals(): returns true", () => {
    assert.equal(new Fraction(1, 2).equals(new Fraction(2, 4)), true);
    assert.equal(new Fraction(3, 8).equals(new Fraction(3, 8)), true);
  });

  it("equals(): returns false", () => {
    assert.equal(new Fraction(1, 2).equals(new Fraction(1, 3)), false);
    assert.equal(new Fraction(2, 3).equals(new Fraction(3, 4)), false);
  });

  it("toString():", () => {
    assert.equal(new Fraction(1, 2).toString(), "1/2");
    assert.equal(new Fraction(2, 4).toString(), "1/2");
    assert.equal(new Fraction(1, -2).toString(), "-1/2");
  });
});
