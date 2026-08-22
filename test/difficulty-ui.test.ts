import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { difficultyLabel, starsToDraw } from "../dist/ui/difficulty.js";

describe("difficultyLabel()", () => {
  it("reads the stars out in words, for a screen reader and a title", () => {
    assert.equal(difficultyLabel({ stars: 2.5, text: "2.5" }), "Difficulty 2.5 of 5 stars");
    assert.equal(difficultyLabel({ stars: 4, text: "4" }), "Difficulty 4 of 5 stars");
  });

  it("says a level nobody has rated is not rated, rather than zero", () => {
    assert.equal(difficultyLabel(undefined), "Not rated yet");
  });
});

describe("starsToDraw()", () => {
  it("lights whole stars, then a half, then leaves the rest hollow", () => {
    assert.deepEqual(starsToDraw(2.5), ["full", "full", "half", "empty", "empty"]);
    assert.deepEqual(starsToDraw(5), ["full", "full", "full", "full", "full"]);
    assert.deepEqual(starsToDraw(0.5), ["half", "empty", "empty", "empty", "empty"]);
  });

  it("rounds a figure that is not in halves to the nearest half, which is how a blended number will be drawn", () => {
    assert.deepEqual(starsToDraw(2.37), ["full", "full", "half", "empty", "empty"]);
    assert.deepEqual(starsToDraw(2.8), ["full", "full", "full", "empty", "empty"]);
  });
});
