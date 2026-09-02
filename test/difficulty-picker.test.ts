import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { starsAtFraction, stepRating } from "../dist/ui/difficulty-picker.js";

describe("starsAtFraction()", () => {
  it("reads the pointer's place along the row as a count of peppers", () => {
    // Five peppers across the row, so each takes a fifth of it and each half a
    // tenth: the right-hand edge of the third pepper is three peppers.
    assert.equal(starsAtFraction(0.2), 1);
    assert.equal(starsAtFraction(0.6), 3);
    assert.equal(starsAtFraction(1), 5);
  });

  it("gives the left half of a pepper the half below it", () => {
    assert.equal(starsAtFraction(0.05), 0.5);
    assert.equal(starsAtFraction(0.5), 2.5);
    assert.equal(starsAtFraction(0.9), 4.5);
  });

  it("never reads less than half a pepper, or more than five", () => {
    // The scale has no zero: half a pepper is the least anybody can say.
    assert.equal(starsAtFraction(0), 0.5);
    assert.equal(starsAtFraction(-0.4), 0.5);
    assert.equal(starsAtFraction(1.4), 5);
  });
});

describe("stepRating()", () => {
  it("moves by half a pepper", () => {
    assert.equal(stepRating(3, 0.5), 3.5);
    assert.equal(stepRating(3, -0.5), 2.5);
  });

  it("starts from the middle of the scale when nothing has been said", () => {
    assert.equal(stepRating(undefined, 0.5), 3);
    assert.equal(stepRating(undefined, -0.5), 2);
  });

  it("stops at the ends rather than walking off them", () => {
    assert.equal(stepRating(5, 0.5), 5);
    assert.equal(stepRating(0.5, -0.5), 0.5);
  });
});
