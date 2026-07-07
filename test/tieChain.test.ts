import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findTiedChain } from "../dist/music/tieChain.js";

describe("findTiedChain()", () => {
  it("returns [index] for an untied index", () => {
    const tiedToNext = new Set([0, 2]);
    assert.deepEqual(findTiedChain(tiedToNext, 5), [5]);
  });

  it("returns [index] when tiedToNext is empty", () => {
    assert.deepEqual(findTiedChain(new Set(), 3), [3]);
  });

  it("returns the full chain from the start of a multi-element chain", () => {
    const tiedToNext = new Set([0, 1]);
    assert.deepEqual(findTiedChain(tiedToNext, 0), [0, 1, 2]);
  });

  it("returns the full chain from the middle of a multi-element chain", () => {
    const tiedToNext = new Set([0, 1]);
    assert.deepEqual(findTiedChain(tiedToNext, 1), [0, 1, 2]);
  });

  it("returns the full chain from the end of a multi-element chain", () => {
    const tiedToNext = new Set([0, 1]);
    assert.deepEqual(findTiedChain(tiedToNext, 2), [0, 1, 2]);
  });
});
