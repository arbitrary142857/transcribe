import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { difficultyLabel, peppersToDraw } from "../dist/ui/difficulty.js";

describe("difficultyLabel()", () => {
  it("reads the peppers out in words, for a screen reader and a title", () => {
    assert.equal(difficultyLabel({ stars: 2.5, text: "2.5" }), "Difficulty 2.5 of 5 peppers");
    assert.equal(difficultyLabel({ stars: 4, text: "4" }), "Difficulty 4 of 5 peppers");
  });
});

describe("peppersToDraw()", () => {
  it("fills whole peppers, then a half, then leaves the rest empty", () => {
    assert.deepEqual(peppersToDraw(2.5), ["full", "full", "half", "empty", "empty"]);
    assert.deepEqual(peppersToDraw(5), ["full", "full", "full", "full", "full"]);
    assert.deepEqual(peppersToDraw(0.5), ["half", "empty", "empty", "empty", "empty"]);
  });

  it("rounds a figure that is not in halves to the nearest half, which is how a blended number is drawn", () => {
    assert.deepEqual(peppersToDraw(2.37), ["full", "full", "half", "empty", "empty"]);
    assert.deepEqual(peppersToDraw(2.8), ["full", "full", "full", "empty", "empty"]);
  });
});
