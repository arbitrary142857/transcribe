import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Fraction } from "../dist/music/fraction.js";
import { Tuplet } from "../dist/music/tuplet.js";

describe("Tuplet", () => {
  it("constants", () => {
    assert.deepEqual(Tuplet.None, new Tuplet(1, 1));
    assert.deepEqual(Tuplet.Triplet, new Tuplet(3, 2));
    assert.deepEqual(Tuplet.Quintuplet, new Tuplet(5, 4));
  });

  it("constructor: throws RangeError when numNotes is not a positive integer", () => {
    assert.throws(
      () => new Tuplet(0, 2),
      (err: unknown) =>
        err instanceof RangeError &&
        err.message === "numNotes must be a positive integer",
    );
    assert.throws(
      () => new Tuplet(2.5, 2),
      (err: unknown) =>
        err instanceof RangeError &&
        err.message === "numNotes must be a positive integer",
    );
  });

  it("constructor: throws RangeError when inTimeOf is not a positive integer", () => {
    assert.throws(
      () => new Tuplet(3, 0),
      (err: unknown) =>
        err instanceof RangeError &&
        err.message === "inTimeOf must be a positive integer",
    );
  });

  it("isNone()", () => {
    assert.equal(Tuplet.None.isNone(), true);
    assert.equal(new Tuplet(2, 2).isNone(), true);
    assert.equal(Tuplet.Triplet.isNone(), false);
    assert.equal(Tuplet.Quintuplet.isNone(), false);
  });

  it("asFraction()", () => {
    assert.deepEqual(Tuplet.None.asFraction(), new Fraction(1, 1));
    assert.deepEqual(Tuplet.Triplet.asFraction(), new Fraction(2, 3));
    assert.deepEqual(Tuplet.Quintuplet.asFraction(), new Fraction(4, 5));
    assert.deepEqual(new Tuplet(6, 4).asFraction(), new Fraction(2, 3));
  });

  it("isEqual()", () => {
    assert.equal(Tuplet.Triplet.isEqual(new Tuplet(3, 2)), true);
    assert.equal(Tuplet.Triplet.isEqual(Tuplet.Quintuplet), false);
    assert.equal(new Tuplet(6, 4).isEqual(Tuplet.Triplet), false);
  });

  it("toString()", () => {
    assert.equal(Tuplet.Triplet.toString(), "3:2");
    assert.equal(Tuplet.Quintuplet.toString(), "5:4");
    assert.equal(new Tuplet(7, 4).toString(), "7:4");
  });
});
