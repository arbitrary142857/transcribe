import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pauseStopwatch,
  readStopwatch,
  resumeStopwatch,
  startedStopwatch,
} from "../dist/puzzle/stopwatch.js";

/**
 * Wall readings are handed in rather than taken, exactly as `clock.ts` takes
 * its samples, so a test can move time without waiting for it.
 */
describe("startedStopwatch()", () => {
  it("counts from nothing on a puzzle opened for the first time", () => {
    const watch = startedStopwatch(0, 1_000);

    assert.equal(readStopwatch(watch, 1_000), 0);
    assert.equal(readStopwatch(watch, 4_500), 3_500);
  });

  it("carries on from what a reload restored", () => {
    // The timer survives a reload, so it opens holding the time already spent
    // and adds to it rather than starting over.
    const watch = startedStopwatch(60_000, 1_000);

    assert.equal(readStopwatch(watch, 3_000), 62_000);
  });
});

describe("pauseStopwatch()", () => {
  it("stops counting, and keeps what it had counted", () => {
    const watch = pauseStopwatch(startedStopwatch(0, 1_000), 5_000);

    assert.equal(readStopwatch(watch, 5_000), 4_000);
    // Time passes, and none of it is the puzzle's.
    assert.equal(readStopwatch(watch, 900_000), 4_000);
  });

  it("is the same paused twice as paused once", () => {
    // The tab can report itself hidden more than once -- a blur behind a
    // visibilitychange, say -- and the second must not rewind the first.
    const once = pauseStopwatch(startedStopwatch(0, 1_000), 5_000);
    const twice = pauseStopwatch(once, 9_000);

    assert.equal(readStopwatch(twice, 9_000), 4_000);
  });
});

describe("resumeStopwatch()", () => {
  it("picks up from where the pause left it", () => {
    let watch = startedStopwatch(0, 1_000);
    watch = pauseStopwatch(watch, 3_000);
    watch = resumeStopwatch(watch, 100_000);

    assert.equal(readStopwatch(watch, 100_000), 2_000);
    assert.equal(readStopwatch(watch, 101_500), 3_500);
  });

  it("counts a run that was never paused only once", () => {
    // Resuming something already running would otherwise move its start
    // forward and quietly lose the time before it.
    const watch = resumeStopwatch(startedStopwatch(0, 1_000), 5_000);

    assert.equal(readStopwatch(watch, 5_000), 4_000);
  });

  it("adds up the visible stretches and none of the hidden ones", () => {
    let watch = startedStopwatch(0, 0);
    watch = pauseStopwatch(watch, 2_000); //   visible: 0 -> 2s
    watch = resumeStopwatch(watch, 900_000);
    watch = pauseStopwatch(watch, 902_000); // visible: 2s -> 4s
    watch = resumeStopwatch(watch, 1_800_000);
    //                                         visible: 4s -> 6s

    // Half an hour of wall time, six seconds of it spent on the puzzle.
    assert.equal(readStopwatch(watch, 1_802_000), 6_000);
  });
});
