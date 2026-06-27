import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSection,
  pressJumpBack,
  pressPause,
  pressPlay,
  setLooping,
  setRange,
  stepSection,
  type SectionState,
} from "../dist/playback/section-play.js";

/** A ten-second section of a longer video. */
const RANGE = { start: 10, end: 20 };

/** A section already playing, its edge detector warmed up at `now`. */
function playingAt(now: number, looping = false): SectionState {
  const state = setLooping({ ...createSection(RANGE), playing: true }, looping);
  return stepSection(state, { kind: "tick", now, wall: 1000 }).state;
}

const commandsOf = (step: { commands: readonly { kind: string }[] }) =>
  step.commands.map((command) => command.kind);

describe("flowing over the end", () => {
  it("wraps when playback flows over the end while looping", () => {
    const step = stepSection(playingAt(19.9, true), {
      kind: "tick",
      now: 20.01,
      wall: 1016,
    });
    assert.deepEqual(step.commands, [{ kind: "seek", to: 10 }]);
  });

  it("pauses when playback flows over the end otherwise", () => {
    const step = stepSection(playingAt(19.9), {
      kind: "tick",
      now: 20.01,
      wall: 1016,
    });
    assert.deepEqual(commandsOf(step), ["pause"]);
  });

  it("ignores a landing past the end that arrived by scrubbing", () => {
    // A teleport re-bases the edge detector; only *flowing* over the end acts.
    const jumped = stepSection(playingAt(14, true), {
      kind: "jump",
      to: 55,
      wall: 1016,
    });
    assert.deepEqual(jumped.commands, []);
    const next = stepSection(jumped.state, { kind: "tick", now: 55.02, wall: 1032 });
    assert.deepEqual(next.commands, []);
  });

  it("does not fire while paused", () => {
    const paused = { ...playingAt(19.9, true), playing: false };
    const step = stepSection(paused, { kind: "tick", now: 20.01, wall: 1016 });
    assert.deepEqual(step.commands, []);
  });

  it("does not fire twice while its own wrap seek is landing", () => {
    const wrapped = stepSection(playingAt(19.9, true), {
      kind: "tick",
      now: 20.01,
      wall: 1016,
    });
    // The video keeps playing past the end until the seek lands.
    const during = stepSection(wrapped.state, { kind: "tick", now: 20.2, wall: 1116 });
    assert.deepEqual(during.commands, []);
    // The landing is a jump, which re-bases the detector below the end...
    const landed = stepSection(during.state, { kind: "jump", to: 10.01, wall: 1216 });
    assert.deepEqual(landed.commands, []);
    // ...so the next flow over the end wraps again.
    const around = stepSection(landed.state, { kind: "tick", now: 19.99, wall: 9000 });
    const again = stepSection(around.state, { kind: "tick", now: 20.01, wall: 9016 });
    assert.deepEqual(commandsOf(again), ["seek"]);
  });

  it("wraps a section a sixteenth note long, over and over", () => {
    let state = setRange(playingAt(10.05, true), { start: 10, end: 10.083 });
    const first = stepSection(state, { kind: "tick", now: 10.09, wall: 1016 });
    assert.deepEqual(first.commands, [{ kind: "seek", to: 10 }]);
    const landed = stepSection(first.state, { kind: "jump", to: 10.005, wall: 1180 });
    const second = stepSection(landed.state, { kind: "tick", now: 10.09, wall: 1300 });
    assert.deepEqual(commandsOf(second), ["seek"]);
  });
});

describe("an end mark before the start", () => {
  it("treats it as no end at all", () => {
    // Spiritually the end has no meaning here; only the start still does.
    const inverted = setRange(playingAt(4.9, true), { start: 10, end: 5 });
    const step = stepSection(inverted, { kind: "tick", now: 5.01, wall: 1016 });
    assert.deepEqual(step.commands, []);
  });

  it("still restarts from the start when play is pressed before it", () => {
    const inverted = setRange(createSection(RANGE), { start: 10, end: 5 });
    const step = pressPlay(inverted, 2);
    assert.deepEqual(step.commands, [{ kind: "seek", to: 10 }, { kind: "play" }]);
  });

  it("resumes in place anywhere past the start, running open-ended", () => {
    const inverted = setRange(createSection(RANGE), { start: 10, end: 5 });
    const step = pressPlay(inverted, 42);
    assert.deepEqual(commandsOf(step), ["play"]);
  });
});

describe("the video's own end", () => {
  it("starts the section again when it ends while looping", () => {
    const step = stepSection(playingAt(200, true), {
      kind: "state",
      state: "ended",
      now: 212,
      wall: 2000,
    });
    assert.deepEqual(commandsOf(step), ["seek", "play"]);
    assert.equal(step.state.playing, false);
  });

  it("just stops when it ends otherwise", () => {
    const step = stepSection(playingAt(200), {
      kind: "state",
      state: "ended",
      now: 212,
      wall: 2000,
    });
    assert.deepEqual(step.commands, []);
    assert.equal(step.state.playing, false);
  });
});

describe("the late pause", () => {
  it("clamps a pause that landed far past the boundary", () => {
    // A throttled background tab notices the crossing late; the frame should
    // not be left standing far outside the section.
    const stopping = stepSection(playingAt(19.9), {
      kind: "tick",
      now: 20.01,
      wall: 1016,
    });
    const late = stepSection(stopping.state, {
      kind: "state",
      state: "paused",
      now: 21.4,
      wall: 1300,
    });
    assert.deepEqual(late.commands, [{ kind: "seek", to: 20 }]);
  });

  it("leaves a tidy stop where it landed", () => {
    const stopping = stepSection(playingAt(19.9), {
      kind: "tick",
      now: 20.01,
      wall: 1016,
    });
    const tidy = stepSection(stopping.state, {
      kind: "state",
      state: "paused",
      now: 20.12,
      wall: 1200,
    });
    assert.deepEqual(tidy.commands, []);
  });
});

describe("the presses", () => {
  it("restarts from the start when pressed outside the section", () => {
    assert.deepEqual(commandsOf(pressPlay(createSection(RANGE), 3)), [
      "seek",
      "play",
    ]);
    assert.deepEqual(commandsOf(pressPlay(createSection(RANGE), 20.1)), [
      "seek",
      "play",
    ]);
  });

  it("resumes in place when pressed inside", () => {
    assert.deepEqual(commandsOf(pressPlay(createSection(RANGE), 14)), ["play"]);
  });

  it("pauses on demand", () => {
    assert.deepEqual(commandsOf(pressPause(createSection(RANGE))), ["pause"]);
  });

  it("jump-back returns to the start and leaves the transport alone", () => {
    const step = pressJumpBack(createSection(RANGE));
    assert.deepEqual(step.commands, [{ kind: "seek", to: 10 }]);
  });
});

describe("the transport mirror", () => {
  it("follows playing and paused, from whichever controls", () => {
    let state = createSection(RANGE);
    state = stepSection(state, { kind: "state", state: "playing", now: 3, wall: 1000 }).state;
    assert.equal(state.playing, true);
    state = stepSection(state, { kind: "state", state: "paused", now: 4, wall: 2000 }).state;
    assert.equal(state.playing, false);
  });

  it("holds its belief through buffering", () => {
    let state = createSection(RANGE);
    state = stepSection(state, { kind: "state", state: "playing", now: 3, wall: 1000 }).state;
    state = stepSection(state, { kind: "state", state: "buffering", now: 3, wall: 1100 }).state;
    assert.equal(state.playing, true);
  });
});
