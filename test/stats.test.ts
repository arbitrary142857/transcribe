import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATS_FLOOR, medianOf } from "../dist/shared/stats.js";

describe("medianOf()", () => {
  it("answers nothing under three values, which is the privacy floor", () => {
    assert.equal(STATS_FLOOR, 3);
    assert.equal(medianOf([]), undefined);
    assert.equal(medianOf([90_000]), undefined);
    assert.equal(medianOf([90_000, 30_000]), undefined);
  });

  it("takes the middle value of an odd count, whatever the order given", () => {
    assert.equal(medianOf([120_000, 30_000, 90_000]), 90_000);
    assert.equal(medianOf([30_000, 90_000, 120_000]), 90_000);
  });

  it("averages the two middles of an even count, floored to a whole", () => {
    assert.equal(medianOf([30_000, 60_000, 90_000, 120_000]), 75_000);
    assert.equal(medianOf([1, 2, 4, 5]), 3);
    assert.equal(medianOf([1, 2, 3, 4]), 2);
  });

  it("leaves the values it was given as they were", () => {
    const values = [120_000, 30_000, 90_000];
    medianOf(values);
    assert.deepEqual(values, [120_000, 30_000, 90_000]);
  });
});
