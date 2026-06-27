import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bpmOf,
  stepTiming,
  timingProblem,
  type TimingAction,
  type TimingState,
} from "../dist/playback/timing-fields.js";
import { approxEqual } from "./helpers/approx-equal.js";

/** Quarter-note beats, four to the bar. */
const BEATS = 4;

const UNSET: TimingState = { locked: false };

/** Ten seconds to the bar-pair: 2 bars over 10s → 48 BPM at four beats a bar. */
const MARKED: TimingState = { start: 10, end: 20, measures: 2, locked: false };
const LOCKED: TimingState = { ...MARKED, locked: true };

const step = (
  state: TimingState,
  action: TimingAction,
  duration?: number,
) => stepTiming(state, action, BEATS, duration);

describe("bpmOf()", () => {
  it("computes the tempo from the marks and the measures", () => {
    // Eight beats in ten seconds.
    assert.equal(bpmOf(MARKED, BEATS), 48);
  });

  it("is nothing while any ingredient is missing", () => {
    assert.equal(bpmOf(UNSET, BEATS), undefined);
    assert.equal(bpmOf({ start: 10, end: 20, locked: false }, BEATS), undefined);
    assert.equal(bpmOf({ start: 10, measures: 2, locked: false }, BEATS), undefined);
  });

  it("is nothing while the marks are out of order", () => {
    assert.equal(
      bpmOf({ start: 20, end: 10, measures: 2, locked: false }, BEATS),
      undefined,
    );
    assert.equal(
      bpmOf({ start: 10, end: 10, measures: 2, locked: false }, BEATS),
      undefined,
    );
  });
});

describe("stepTiming() unlocked", () => {
  it("takes a mark and reports the tempo it re-derived", () => {
    const first = step(UNSET, { kind: "mark-start", seconds: 10 });
    assert.equal(first.state.start, 10);
    const second = step(first.state, { kind: "mark-end", seconds: 20 });
    const third = step(second.state, { kind: "type-measures", count: 2 });
    assert.ok(third.autoEdited.includes("bpm"));
    assert.equal(bpmOf(third.state, BEATS), 48);
  });

  it("keeps marks that are out of order rather than swapping them", () => {
    const { state } = step(MARKED, { kind: "type-start", seconds: 25 });
    assert.equal(state.start, 25);
    assert.equal(state.end, 20);
    assert.match(timingProblem(state, BEATS)!, /end mark/);
  });

  it("moves the end when the tempo is typed", () => {
    // 96 BPM over 2 bars of 4 beats: 8 beats at 0.625s = 5s.
    const { state, autoEdited } = step(MARKED, { kind: "type-bpm", bpm: 96 });
    assert.equal(state.start, 10);
    assert.equal(state.end, 15);
    assert.ok(autoEdited.includes("end"));
  });

  it("re-derives the tempo it was given, to display precision", () => {
    const { state } = step(MARKED, { kind: "type-bpm", bpm: 92.5 });
    approxEqual(bpmOf(state, BEATS)!, 92.5, 0.05);
  });

  it("refuses a typed tempo outside the plausible range", () => {
    assert.ok(step(MARKED, { kind: "type-bpm", bpm: 5 }).rejected);
    assert.ok(step(MARKED, { kind: "type-bpm", bpm: 700 }).rejected);
  });

  it("refuses a typed tempo that would run the end past the video", () => {
    const result = step(MARKED, { kind: "type-bpm", bpm: 10.5 }, 30);
    assert.ok(result.rejected);
    assert.equal(result.state.end, 20);
  });

  it("clamps a typed time into the video and says it did", () => {
    const low = step(MARKED, { kind: "type-start", seconds: -3 });
    assert.equal(low.state.start, 0);
    assert.ok(low.autoEdited.includes("start"));

    const high = step(MARKED, { kind: "type-end", seconds: 500 }, 60);
    assert.equal(high.state.end, 60);
    assert.ok(high.autoEdited.includes("end"));
  });

  it("leaves a typed end alone when the video length is not yet known", () => {
    const { state } = step(MARKED, { kind: "type-end", seconds: 500 });
    assert.equal(state.end, 500);
  });

  it("treats an emptied field as unset", () => {
    const { state } = step(MARKED, { kind: "type-end", seconds: undefined });
    assert.equal(state.end, undefined);
    assert.equal(bpmOf(state, BEATS), undefined);
  });

  it("quantizes every mark to the millisecond", () => {
    const { state } = step(UNSET, { kind: "mark-start", seconds: 10.123456 });
    assert.equal(state.start, 10.123);
  });

  it("refuses a bar count that is not a plausible count", () => {
    assert.ok(step(MARKED, { kind: "type-measures", count: 0 }).rejected);
    assert.ok(step(MARKED, { kind: "type-measures", count: 2.5 }).rejected);
    assert.ok(step(MARKED, { kind: "type-measures", count: 1000 }).rejected);
  });

  it("nudges a mark by a step", () => {
    const { state } = step(MARKED, { kind: "nudge", field: "start", seconds: 0.1 });
    assert.equal(state.start, 10.1);
  });

  it("nudges nothing when the field is not set", () => {
    const { state, autoEdited } = step(UNSET, {
      kind: "nudge",
      field: "start",
      seconds: 0.1,
    });
    assert.equal(state.start, undefined);
    assert.equal(autoEdited.length, 0);
  });
});

describe("stepTiming() locked", () => {
  it("will not lock without a tempo", () => {
    assert.ok(step(UNSET, { kind: "toggle-lock" }).rejected);
    assert.ok(
      step(
        { start: 20, end: 10, measures: 2, locked: false },
        { kind: "toggle-lock" },
      ).rejected,
    );
  });

  it("locks a valid tempo, and always unlocks", () => {
    const locked = step(MARKED, { kind: "toggle-lock" });
    assert.equal(locked.state.locked, true);
    const unlocked = step(locked.state, { kind: "toggle-lock" });
    assert.equal(unlocked.state.locked, false);
  });

  it("moves the end to keep the span when the start moves", () => {
    for (const action of [
      { kind: "type-start", seconds: 15 },
      { kind: "mark-start", seconds: 15 },
    ] as const) {
      const { state, autoEdited } = step(LOCKED, action);
      assert.equal(state.start, 15);
      assert.equal(state.end, 25);
      assert.ok(autoEdited.includes("end"));
    }
  });

  it("moves the start to keep the span when the end moves", () => {
    const { state, autoEdited } = step(LOCKED, { kind: "type-end", seconds: 30 });
    assert.equal(state.start, 20);
    assert.equal(state.end, 30);
    assert.ok(autoEdited.includes("start"));
  });

  it("keeps the tempo when the bar count changes", () => {
    const before = bpmOf(LOCKED, BEATS);
    const { state, autoEdited } = step(LOCKED, { kind: "type-measures", count: 3 });
    assert.equal(state.end, 25);
    assert.ok(autoEdited.includes("end"));
    assert.equal(bpmOf(state, BEATS), before);
  });

  it("refuses an end that would push the start before the video begins", () => {
    const result = step(LOCKED, { kind: "type-end", seconds: 4 });
    assert.ok(result.rejected);
    assert.equal(result.state.start, 10);
    assert.equal(result.state.end, 20);
  });

  it("refuses a start that would push the end past the video", () => {
    const result = step(LOCKED, { kind: "type-start", seconds: 55 }, 60);
    assert.ok(result.rejected);
    assert.equal(result.state.start, 10);
  });

  it("refuses to empty a field while locked", () => {
    assert.ok(step(LOCKED, { kind: "type-start", seconds: undefined }).rejected);
    assert.ok(step(LOCKED, { kind: "type-measures", count: undefined }).rejected);
  });

  it("nudges under the same rules, dragging the partner", () => {
    const { state, autoEdited } = step(LOCKED, {
      kind: "nudge",
      field: "start",
      seconds: -0.1,
    });
    assert.equal(state.start, 9.9);
    assert.equal(state.end, 19.9);
    assert.ok(autoEdited.includes("end"));
  });

  it("never edits the tempo directly", () => {
    assert.ok(step(LOCKED, { kind: "type-bpm", bpm: 60 }).rejected);
  });
});

describe("timingProblem()", () => {
  it("asks for what is missing, in order", () => {
    assert.match(timingProblem(UNSET, BEATS)!, /[Mm]ark/);
    assert.match(
      timingProblem({ start: 10, end: 20, locked: false }, BEATS)!,
      /bars/,
    );
  });

  it("names the out-of-order marks", () => {
    assert.match(
      timingProblem({ start: 20, end: 10, measures: 2, locked: false }, BEATS)!,
      /end mark/,
    );
  });

  it("catches a span too short to be a tempo", () => {
    // One millisecond across two bars of four beats: absurd, and it would ask
    // the metronome for thousands of clicks a second.
    const problem = timingProblem(
      { start: 10, end: 10.001, measures: 2, locked: false },
      BEATS,
    );
    assert.match(problem!, /BPM/);
  });

  it("catches a span too long to be a tempo", () => {
    const problem = timingProblem(
      { start: 0, end: 3600, measures: 2, locked: false },
      BEATS,
    );
    assert.match(problem!, /BPM/);
  });

  it("is content with a workable tempo", () => {
    assert.equal(timingProblem(MARKED, BEATS), undefined);
  });
});
