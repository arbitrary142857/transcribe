import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundaryTimes,
  nearestBoundary,
} from "../dist/playback/section-bounds.js";

/** Four quarter notes at one a second, which is what the marks land on. */
const ONSETS = [0, 1, 2, 3];
const ENDS = [1, 2, 3, 4];

describe("boundaryTimes()", () => {
  it("gives one moment per gap: every onset, and the end of the last note", () => {
    assert.deepEqual(boundaryTimes(ONSETS, ENDS), [0, 1, 2, 3, 4]);
  });

  it("has nothing to separate when there is no music", () => {
    assert.deepEqual(boundaryTimes([], []), []);
  });

  it("gives a single note two sides", () => {
    assert.deepEqual(boundaryTimes([2], [5]), [2, 5]);
  });
});

describe("nearestBoundary()", () => {
  const times = boundaryTimes(ONSETS, ENDS);

  it("finds the gap a mark was taken from exactly", () => {
    // What "set start from this note" writes is the note's own onset, and what
    // "set end" writes is where it stops. Both have to come back as the gap
    // the note is against, or the bracket lands beside the wrong note.
    assert.equal(nearestBoundary(times, ONSETS[2]!), 2);
    assert.equal(nearestBoundary(times, ENDS[2]!), 3);
    assert.equal(nearestBoundary(times, ONSETS[0]!), 0);
    assert.equal(nearestBoundary(times, ENDS[3]!), 4);
  });

  it("rounds a mark inside a note to whichever end of it is closer", () => {
    assert.equal(nearestBoundary(times, 1.4), 1);
    assert.equal(nearestBoundary(times, 1.6), 2);
  });

  it("takes the earlier gap when a mark falls exactly between two", () => {
    // Arbitrary, but it has to be settled: a mark dead centre would otherwise
    // move the bracket about depending on how the search happened to run.
    assert.equal(nearestBoundary(times, 1.5), 1);
  });

  it("rounds a mark outside the music to the closest gap there is", () => {
    assert.equal(nearestBoundary(times, -30), 0);
    assert.equal(nearestBoundary(times, 999), 4);
  });

  it("has no gap to offer when there is no music", () => {
    assert.equal(nearestBoundary([], 3), undefined);
  });
});
