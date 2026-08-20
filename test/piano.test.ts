import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceTiming } from "../dist/playback/piano.js";

/** A note filling the second video second, at MIDI 60. */
const NOTE = { start: 10, end: 11, midi: 60 };

/** Where the audio clock happens to be; nothing depends on the value. */
const AUDIO_NOW = 100;

const near = (actual: number | undefined, expected: number, what: string) => {
  assert.ok(actual !== undefined, `${what} is missing`);
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${what}: ${actual} is not ${expected}`,
  );
};

describe("voiceTiming()", () => {
  it("lines a note still to come up against the audio clock", () => {
    const timing = voiceTiming(NOTE, 9.5, 1, AUDIO_NOW);
    near(timing?.at, AUDIO_NOW + 0.5, "at");
    assert.equal(timing?.offset, 0);
    near(timing?.until, AUDIO_NOW + 1.5, "until");
  });

  it("scales the wait and the length by the rate", () => {
    // Twice as fast: half a second of video is a quarter of a second of sound,
    // and a note a whole video second long rings for half of one.
    const fast = voiceTiming(NOTE, 9.5, 2, AUDIO_NOW);
    near(fast?.at, AUDIO_NOW + 0.25, "at");
    near(fast?.until, AUDIO_NOW + 0.75, "until");

    const slow = voiceTiming(NOTE, 9.5, 0.5, AUDIO_NOW);
    near(slow?.at, AUDIO_NOW + 1, "at");
    near(slow?.until, AUDIO_NOW + 3, "until");
  });

  it("joins a note already under way part-way into its tone", () => {
    const timing = voiceTiming(NOTE, 10.4, 1, AUDIO_NOW);
    near(timing?.at, AUDIO_NOW, "at");
    near(timing?.offset, 0.4, "offset");
    near(timing?.until, AUDIO_NOW + 0.6, "until");
  });

  it("measures the offset in the tone's own seconds, not the video's", () => {
    // The rendered tone is real time and is never pitch-shifted, so four tenths
    // of a video second at double speed is two tenths of it.
    const timing = voiceTiming(NOTE, 10.4, 2, AUDIO_NOW);
    near(timing?.offset, 0.2, "offset");
    near(timing?.until, AUDIO_NOW + 0.3, "until");
  });

  it("never strikes a note whose onset has gone, however narrowly", () => {
    // Even a hair late is joined rather than struck. An attack is a rhythmic
    // event, and putting one where the music has none is the worse error: the
    // note reads as beginning late, and the note after it — lined up correctly
    // — then arrives too soon behind it. Better to be honest about the lag and
    // come in on the tail.
    for (const late of [0.001, 0.02, 0.04, 0.2]) {
      const timing = voiceTiming(NOTE, 10 + late, 1, AUDIO_NOW);
      near(timing?.offset, late, `offset ${late} in`);
    }
  });

  it("takes a note exactly at its start as one still to come", () => {
    const timing = voiceTiming(NOTE, 10, 1, AUDIO_NOW);
    near(timing?.at, AUDIO_NOW, "at");
    assert.equal(timing?.offset, 0);
  });

  it("lets a joined note go at its written end, so nothing drifts", () => {
    // What is left of it, not a fresh copy of all of it: the note stops where
    // the score says whichever moment the line was picked up in.
    near(voiceTiming(NOTE, 10.9, 1, AUDIO_NOW)?.until, AUDIO_NOW + 0.1, "until");
  });

  it("drops a note that has already finished", () => {
    assert.equal(voiceTiming(NOTE, 11, 1, AUDIO_NOW), undefined);
    assert.equal(voiceTiming(NOTE, 11.5, 1, AUDIO_NOW), undefined);
  });

  it("drops a note with no length to it", () => {
    assert.equal(
      voiceTiming({ start: 10, end: 10, midi: 60 }, 9, 1, AUDIO_NOW),
      undefined,
    );
  });
});
