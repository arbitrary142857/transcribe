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
  it("shows exactly the author's word while nobody has rated, with one decimal always", () => {
    assert.deepEqual(displayedDifficulty({ authorDifficulty: 2.5 }), { stars: 2.5, text: "2.5" });
    assert.deepEqual(displayedDifficulty({ authorDifficulty: 4 }), { stars: 4, text: "4.0" });
    assert.deepEqual(
      displayedDifficulty({ authorDifficulty: 4, ratingCount: 0, ratingHalves: 0 }),
      { stars: 4, text: "4.0" },
    );
  });

  it("blends the author's word, counted as four votes, with each solver's one", () => {
    // Author 2 stars = 4 halves, four times over = 16; three solvers at five
    // stars add 30. (16 + 30) / 7 ≈ 6.57 halves ≈ 3.29 stars, shown as 3.5.
    assert.deepEqual(
      displayedDifficulty({ authorDifficulty: 2, ratingCount: 3, ratingHalves: 30 }),
      { stars: 3.5, text: "3.5" },
    );
  });

  it("keeps one loud voice from yanking the figure", () => {
    // One five-star rating on an author's 2: (16 + 10) / 5 = 5.2 halves,
    // shown as 2.5 -- moved half a step, not to 5.
    assert.deepEqual(
      displayedDifficulty({ authorDifficulty: 2, ratingCount: 1, ratingHalves: 10 }),
      { stars: 2.5, text: "2.5" },
    );
  });

  it("prints the blended figure rounded to the nearest half, as the peppers draw it", () => {
    // (4·6 + 9) / 5 = 6.6 halves = 3.3 stars: the text and the drawing must
    // agree, so both say 3.5.
    assert.deepEqual(
      displayedDifficulty({ authorDifficulty: 3, ratingCount: 1, ratingHalves: 9 }),
      { stars: 3.5, text: "3.5" },
    );
  });

  it("shows nothing for a draft with no word from its author, whatever solvers might claim", () => {
    assert.equal(displayedDifficulty({}), undefined);
    assert.equal(displayedDifficulty({ authorDifficulty: undefined }), undefined);
    assert.equal(
      displayedDifficulty({ authorDifficulty: undefined, ratingCount: 2, ratingHalves: 12 }),
      undefined,
    );
  });
});
