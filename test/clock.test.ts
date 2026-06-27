import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readClock, sampleClock, startedClock } from "../dist/playback/clock.js";
import { approxEqual } from "./helpers/approx-equal.js";

const PLAYING = { rate: 1, playing: true };

/** A clock that has just been told the video is at `seconds`. */
const at = (seconds: number, wall = 1000) =>
  startedClock({ wall, reading: seconds, ...PLAYING });

describe("readClock()", () => {
  it("runs forward at the video's own speed", () => {
    const clock = at(30);
    assert.equal(readClock(clock, 1000), 30);
    assert.equal(readClock(clock, 1500), 30.5);
    assert.equal(readClock(clock, 2000), 31);
  });

  it("runs at half speed when the video does", () => {
    const clock = startedClock({
      wall: 1000,
      reading: 30,
      rate: 0.5,
      playing: true,
    });
    assert.equal(readClock(clock, 2000), 30.5);
  });

  it("stands still while the video is paused", () => {
    const clock = startedClock({
      wall: 1000,
      reading: 30,
      rate: 1,
      playing: false,
    });
    assert.equal(readClock(clock, 5000), 30);
  });
});

describe("sampleClock()", () => {
  it("takes a fresh reading as the truth", () => {
    const { state } = sampleClock(at(30), {
      wall: 1100,
      reading: 30.1,
      ...PLAYING,
    });
    assert.equal(readClock(state, 1100), 30.1);
  });

  it("keeps counting across a reading that has not moved", () => {
    // A coarser player repeats its answer between updates. The clock must carry
    // on from where that answer was first given, not restart at it.
    const first = sampleClock(at(30), { wall: 1100, reading: 30.1, ...PLAYING });
    const stale = sampleClock(first.state, {
      wall: 1200,
      reading: 30.1,
      ...PLAYING,
    });
    approxEqual(readClock(stale.state, 1200), 30.2);
    assert.equal(stale.jumped, false);
  });

  it("does not call ordinary jitter a jump", () => {
    // A couple of milliseconds either way is what a healthy player looks like.
    const { jumped, moved } = sampleClock(at(30), {
      wall: 1100,
      reading: 30.098,
      ...PLAYING,
    });
    assert.equal(jumped, false);
    assert.equal(moved, false);
  });

  it("calls a seek a jump", () => {
    const forward = sampleClock(at(30), { wall: 1100, reading: 95, ...PLAYING });
    assert.equal(forward.jumped, true);
    assert.equal(forward.moved, true);
    assert.equal(readClock(forward.state, 1100), 95);

    const backward = sampleClock(at(30), { wall: 1100, reading: 5, ...PLAYING });
    assert.equal(backward.jumped, true);
    assert.equal(backward.moved, true);
  });

  it("sees even a tiny seek backwards", () => {
    // A loop over a sixteenth at 180 BPM wraps back by 83 milliseconds. The
    // reading never runs backwards on its own, so this cannot be jitter.
    const { moved } = sampleClock(at(30), {
      wall: 1100,
      reading: 30.1 - 0.083,
      ...PLAYING,
    });
    assert.equal(moved, true);
  });

  it("lets a small forward stumble pass", () => {
    // Forwards is the direction playback itself goes, so a small lead reads as
    // catching up rather than as a seek.
    const { moved } = sampleClock(at(30), {
      wall: 1100,
      reading: 30.2,
      ...PLAYING,
    });
    assert.equal(moved, false);
  });

  it("calls a change of speed a jump, but not a move", () => {
    const { jumped, moved, state } = sampleClock(at(30), {
      wall: 1100,
      reading: 30.1,
      rate: 0.5,
      playing: true,
    });
    assert.equal(jumped, true);
    assert.equal(moved, false);
    assert.equal(readClock(state, 1600), 30.35);
  });

  it("calls stopping and starting a jump, but not a move", () => {
    const stopped = sampleClock(at(30), {
      wall: 1100,
      reading: 30.1,
      rate: 1,
      playing: false,
    });
    assert.equal(stopped.jumped, true);
    assert.equal(stopped.moved, false);
    assert.equal(readClock(stopped.state, 9999), 30.1);

    const started = sampleClock(stopped.state, {
      wall: 1200,
      reading: 30.1,
      ...PLAYING,
    });
    assert.equal(started.jumped, true);
  });

  it("holds rather than running ahead while a seek settles", () => {
    // After a seek the reading freezes for a few hundred milliseconds while
    // the pipeline catches up. Extrapolating through that freeze at speed is
    // how the old clock ended up ahead of reality by stall-times-rate.
    const seeked = sampleClock(at(30), { wall: 1100, reading: 10, ...PLAYING });
    assert.equal(seeked.moved, true);
    const held = sampleClock(seeked.state, {
      wall: 1400,
      reading: 10,
      ...PLAYING,
    });
    assert.equal(readClock(held.state, 1400), 10);
  });

  it("absorbs the reading that ends a seek's settling without calling it a move", () => {
    // The freeze ends with a snap — the media played some of the stalled
    // stretch — and that snap is the seek finishing, not a second seek.
    const seeked = sampleClock(at(30), { wall: 1100, reading: 10, ...PLAYING });
    const held = sampleClock(seeked.state, { wall: 1400, reading: 10, ...PLAYING });
    const snapped = sampleClock(held.state, {
      wall: 1420,
      reading: 10.4,
      ...PLAYING,
    });
    assert.equal(snapped.moved, false);
    assert.equal(snapped.jumped, false);
    assert.equal(readClock(snapped.state, 1420), 10.4);
  });

  it("still sees a real scrub landing while a seek settles", () => {
    const seeked = sampleClock(at(30), { wall: 1100, reading: 10, ...PLAYING });
    const scrubbed = sampleClock(seeked.state, {
      wall: 1300,
      reading: 55,
      ...PLAYING,
    });
    assert.equal(scrubbed.moved, true);
  });

  it("stops holding once the settling window has passed", () => {
    // A stall that outlives the settling window is no longer a seek finishing;
    // whatever ends it answers to the ordinary rules again.
    const seeked = sampleClock(at(30), { wall: 1100, reading: 10, ...PLAYING });
    const held = sampleClock(seeked.state, { wall: 1880, reading: 10, ...PLAYING });
    // Past the window the repeats extrapolate again, as they always did...
    const expired = sampleClock(held.state, { wall: 2100, reading: 10, ...PLAYING });
    // ...so a snap arriving well behind that extrapolation is a move.
    const snap = sampleClock(expired.state, {
      wall: 2600,
      reading: 10.1,
      ...PLAYING,
    });
    assert.equal(snap.moved, true);
  });

  it("absorbs the stutter after playback starts or resumes", () => {
    // Starting to play stalls the reading just like a seek landing does, and
    // at double speed the extrapolation runs far enough ahead during the
    // stall that the catch-up reading looked like somebody scrubbing.
    const paused = startedClock({
      wall: 1000,
      reading: 12.2,
      rate: 2,
      playing: false,
    });
    const resumed = sampleClock(paused, {
      wall: 1100,
      reading: 12.2,
      rate: 2,
      playing: true,
    });
    const stalled = sampleClock(resumed.state, {
      wall: 1300,
      reading: 12.2,
      rate: 2,
      playing: true,
    });
    // Extrapolation would now expect ~12.6; the pipeline only just started.
    const snapped = sampleClock(stalled.state, {
      wall: 1320,
      reading: 12.25,
      rate: 2,
      playing: true,
    });
    assert.equal(snapped.moved, false);
  });

  it("never runs backwards over a run of jittery readings", () => {
    // Ten seconds of 60Hz samples, each a couple of milliseconds off true.
    let state = at(0, 0);
    let last = 0;
    let wobble = 7;
    for (let frame = 1; frame <= 600; frame++) {
      const wall = frame * (1000 / 60);
      // A cheap repeatable wobble, since a test may not reach for randomness.
      wobble = (wobble * 1103515245 + 12345) % 2048;
      const reading = wall / 1000 + (wobble / 2048 - 0.5) * 0.004;
      state = sampleClock(state, { wall, reading, ...PLAYING }).state;
      const now = readClock(state, wall);
      assert.ok(now >= last, `went backwards at frame ${frame}`);
      last = now;
    }
  });
});
