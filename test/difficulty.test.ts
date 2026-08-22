import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIFFICULTY,
  displayedDifficulty,
  halfOfStars,
  isStars,
  starsOfHalf,
} from "../dist/shared/difficulty.js";

describe("starsOfHalf() and halfOfStars()", () => {
  it("turn a count of halves into stars and back", () => {
    assert.equal(starsOfHalf(1), 0.5);
    assert.equal(starsOfHalf(5), 2.5);
    assert.equal(starsOfHalf(10), 5);
    assert.equal(halfOfStars(0.5), 1);
    assert.equal(halfOfStars(2.5), 5);
    assert.equal(halfOfStars(5), 10);
  });

  it("bound the range in one place", () => {
    assert.equal(starsOfHalf(DIFFICULTY.halfMin), 0.5);
    assert.equal(starsOfHalf(DIFFICULTY.halfMax), 5);
  });
});

describe("isStars()", () => {
  it("accepts half a star to five, in halves", () => {
    for (const stars of [0.5, 1, 2.5, 4.5, 5]) {
      assert.equal(isStars(stars), true, `refused ${stars}`);
    }
  });

  it("refuses anything else, including a number as text", () => {
    for (const stars of [0, 5.5, 2.25, -1, Number.NaN, "3", null, undefined]) {
      assert.equal(isStars(stars), false, `accepted ${String(stars)}`);
    }
  });
});

describe("displayedDifficulty()", () => {
  it("shows the author's word, with its text", () => {
    assert.deepEqual(displayedDifficulty({ authorDifficulty: 2.5 }), { stars: 2.5, text: "2.5" });
    assert.deepEqual(displayedDifficulty({ authorDifficulty: 4 }), { stars: 4, text: "4" });
  });

  it("shows nothing for a level nobody has rated", () => {
    assert.equal(displayedDifficulty({}), undefined);
    assert.equal(displayedDifficulty({ authorDifficulty: undefined }), undefined);
  });
});
