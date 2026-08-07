import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keyName, levelFacts } from "../dist/ui/level-card.js";
import type { TranscriptionSummary } from "../dist/shared/transcription.js";

/** A level as the listing route hands one over. */
const level = (
  over: Partial<TranscriptionSummary> = {},
): TranscriptionSummary => ({
  id: "k3m9x2p7qw4t",
  title: "Clair de lune",
  subtitle: "Debussy",
  videoId: "dQw4w9WgXcQ",
  // Four bars of 4/4 across eight seconds is 120 to the beat.
  markStart: 0,
  markEnd: 8,
  measures: 4,
  clef: "treble",
  meter: { beats: 4, beatUnit: 4 },
  keyFifths: 0,
  keyMode: "major",
  noteCount: 12,
  createdAt: 1_754_500_000_000,
  ...over,
});

describe("keyName()", () => {
  it("writes the key the way it is spoken, with signs and not letters", () => {
    assert.equal(keyName(level({ keyFifths: -5 })), "D♭ major");
    assert.equal(keyName(level({ keyFifths: 2 })), "D major");
    assert.equal(keyName(level({ keyFifths: 0 })), "C major");
    assert.equal(
      keyName(level({ keyFifths: 0, keyMode: "minor" })),
      "A minor",
    );
  });
});

describe("levelFacts()", () => {
  it("says what it is in, how much there is, and how long it runs", () => {
    assert.equal(
      levelFacts(level()),
      "C major · 4/4 · 4 bars · 120 BPM · 12 notes · 8s",
    );
  });

  it("counts the beat a player feels, so 6/8 gets two to the bar", () => {
    // Two bars of 6/8 across two seconds: four felt beats, not twelve.
    const compound = level({
      meter: { beats: 6, beatUnit: 8 },
      measures: 2,
      markStart: 0,
      markEnd: 2,
    });

    assert.match(levelFacts(compound), /6\/8 · 2 bars · 120 BPM/);
  });

  it("is unmoved by where in the video the section was taken from", () => {
    assert.match(levelFacts(level({ markStart: 630, markEnd: 638 })), /120 BPM/);
  });

  it("drops the s from a single bar and a single note", () => {
    const one = level({ measures: 1, noteCount: 1, markEnd: 2 });

    assert.match(levelFacts(one), /· 1 bar ·/);
    assert.match(levelFacts(one), /· 1 note ·/);
  });

  it("rounds the length to the second, as a card is read at a glance", () => {
    assert.match(levelFacts(level({ markStart: 0, markEnd: 31.6 })), /· 32s$/);
    assert.match(levelFacts(level({ markStart: 0, markEnd: 31.4 })), /· 31s$/);
  });
});
