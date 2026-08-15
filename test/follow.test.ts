import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventAtSeconds, SNAP_SECONDS } from "../dist/playback/follow.js";

/** Four half-second notes, the second starting at 10.5. */
const EVEN = [10, 10.5, 11, 11.5];

describe("eventAtSeconds()", () => {
  it("takes the note the reading is inside", () => {
    assert.equal(eventAtSeconds(EVEN, 10.2), 0);
    assert.equal(eventAtSeconds(EVEN, 10.9), 1);
    assert.equal(eventAtSeconds(EVEN, 11.7), 3);
  });

  it("takes a note the reading has just reached", () => {
    assert.equal(eventAtSeconds(EVEN, 10.5), 1);
  });

  it("takes the note about to begin, when the reading is a hair before it", () => {
    // The case the bar was getting wrong. A mark taken from a note is rounded
    // to the millisecond and the player lands on a frame boundary, so the
    // reading parks just below the onset — and the clock holds it there for the
    // length of the seek.
    assert.equal(eventAtSeconds(EVEN, 10.5 - 0.0004), 1);
    assert.equal(eventAtSeconds(EVEN, 10.5 - SNAP_SECONDS), 1);
  });

  it("leaves a reading further out than the snap where it is", () => {
    assert.equal(eventAtSeconds(EVEN, 10.5 - SNAP_SECONDS - 0.001), 0);
  });

  it("never lights a note earlier than halfway through the one it leaves", () => {
    // Notes shorter than twice the snap, which the constant alone would run
    // straight over: a thirty-second at 200 BPM is about this long.
    const short = [0, 0.03, 0.06, 0.09];
    // Halfway through a note is as early as the next one may be lit, so the
    // first half of every note is always its own.
    assert.equal(eventAtSeconds(short, 0.014), 0);
    assert.equal(eventAtSeconds(short, 0.015), 1);
  });

  it("holds the first note before any onset has passed", () => {
    // The caller has already refused anything outside the marked music, so a
    // reading below the first onset is one settling onto it.
    assert.equal(eventAtSeconds(EVEN, 9), 0);
  });

  it("holds the last note once the reading is past every onset", () => {
    assert.equal(eventAtSeconds(EVEN, 99), 3);
  });

  it("reads a melody with nothing in it as nothing", () => {
    assert.equal(eventAtSeconds([], 10), undefined);
  });

  it("takes the only note there is, wherever the reading sits", () => {
    assert.equal(eventAtSeconds([10], 9), 0);
    assert.equal(eventAtSeconds([10], 12), 0);
  });
});
