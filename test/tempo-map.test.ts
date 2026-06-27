import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beatsBetween,
  beatsPerMinute,
  positionAtSeconds,
  secondsAtPosition,
  tempoMapOf,
} from "../dist/playback/tempo-map.js";

const METER_4_4 = { beats: 4, beatUnit: 4 } as const;
const METER_3_4 = { beats: 3, beatUnit: 4 } as const;
const METER_2_4 = { beats: 2, beatUnit: 4 } as const;
const METER_6_8 = { beats: 6, beatUnit: 8 } as const;
const METER_9_8 = { beats: 9, beatUnit: 8 } as const;
const METER_12_8 = { beats: 12, beatUnit: 8 } as const;
const METER_5_8 = { beats: 5, beatUnit: 8 } as const;
const METER_3_8 = { beats: 3, beatUnit: 8 } as const;

/** Two bars of 4/4 taking four seconds, so one beat is half a second. */
const TWO_BARS = tempoMapOf({ start: 10, end: 14 }, 2, METER_4_4)!;

const at = (index: number) => 10 + index * 0.5;

const beatsIn = (meter: { beats: number; beatUnit: number }) =>
  tempoMapOf({ start: 0, end: 1 }, 1, meter)!.beatsPerBar;

describe("tempoMapOf()", () => {
  it("clicks the beat the meter names in simple time", () => {
    assert.equal(beatsIn(METER_4_4), 4);
    assert.equal(beatsIn(METER_3_4), 3);
    assert.equal(beatsIn(METER_2_4), 2);
  });

  it("clicks the beat a player feels in compound time", () => {
    assert.equal(beatsIn(METER_6_8), 2);
    assert.equal(beatsIn(METER_9_8), 3);
    assert.equal(beatsIn(METER_12_8), 4);
  });

  it("clicks every beat where the meter does not group in threes", () => {
    assert.equal(beatsIn(METER_5_8), 5);
    // Three at the top is simple triple, not one compound beat.
    assert.equal(beatsIn(METER_3_8), 3);
  });

  it("refuses a melody with no bars of music in it", () => {
    assert.equal(tempoMapOf({ start: 1, end: 5 }, 0, METER_4_4), undefined);
  });

  it("refuses marks that do not run forwards", () => {
    assert.equal(tempoMapOf({ start: 5, end: 5 }, 2, METER_4_4), undefined);
    assert.equal(tempoMapOf({ start: 9, end: 5 }, 2, METER_4_4), undefined);
  });

  it("refuses marks that are not real numbers", () => {
    assert.equal(tempoMapOf({ start: NaN, end: 5 }, 2, METER_4_4), undefined);
    assert.equal(
      tempoMapOf({ start: 0, end: Infinity }, 2, METER_4_4),
      undefined,
    );
  });
});

describe("secondsAtPosition()", () => {
  it("puts the head of the first bar on the start mark", () => {
    assert.equal(secondsAtPosition(TWO_BARS, 0), 10);
  });

  it("puts the end of the last bar on the end mark", () => {
    // Two bars of 4/4 is two whole notes.
    assert.equal(secondsAtPosition(TWO_BARS, 2), 14);
  });

  it("spreads the music evenly between the two", () => {
    assert.equal(secondsAtPosition(TWO_BARS, 1), 12);
    assert.equal(secondsAtPosition(TWO_BARS, 0.25), 10.5);
  });

  it("carries on past either mark", () => {
    assert.equal(secondsAtPosition(TWO_BARS, -0.5), 9);
    assert.equal(secondsAtPosition(TWO_BARS, 3), 16);
  });
});

describe("positionAtSeconds()", () => {
  it("undoes secondsAtPosition", () => {
    for (const wholes of [0, 0.125, 0.75, 1, 1.9375, 2]) {
      assert.equal(
        positionAtSeconds(TWO_BARS, secondsAtPosition(TWO_BARS, wholes)),
        wholes,
      );
    }
  });
});

describe("beatsPerMinute()", () => {
  it("counts the beat that is actually clicked", () => {
    // Eight quarter-note beats in four seconds.
    assert.equal(beatsPerMinute(TWO_BARS), 120);
  });

  it("counts compound time in its dotted beats", () => {
    // Two bars of 6/8 in four seconds: four dotted-quarter beats, not twelve.
    const map = tempoMapOf({ start: 0, end: 4 }, 2, METER_6_8)!;
    assert.equal(beatsPerMinute(map), 60);
  });
});

describe("beatsBetween()", () => {
  it("gives every click inside the window", () => {
    const beats = beatsBetween(TWO_BARS, 10, 12);
    assert.deepEqual(
      beats.map((beat) => beat.seconds),
      [10, 10.5, 11, 11.5],
    );
  });

  it("takes the near edge and leaves the far one", () => {
    // Half-open, so two windows meeting at a beat never sound it twice.
    const first = beatsBetween(TWO_BARS, 10, 11);
    const second = beatsBetween(TWO_BARS, 11, 12);
    assert.deepEqual(
      first.map((beat) => beat.index),
      [0, 1],
    );
    assert.deepEqual(
      second.map((beat) => beat.index),
      [2, 3],
    );
  });

  it("accents the first beat of each bar", () => {
    const beats = beatsBetween(TWO_BARS, 10, 14);
    assert.deepEqual(
      beats.map((beat) => beat.accented),
      [true, false, false, false, true, false, false, false],
    );
  });

  it("keeps the pulse before the start mark, for a count-in", () => {
    const beats = beatsBetween(TWO_BARS, 8.75, 10);
    assert.deepEqual(
      beats.map((beat) => beat.index),
      [-2, -1],
    );
    assert.deepEqual(
      beats.map((beat) => beat.seconds),
      [9, 9.5],
    );
  });

  it("accents the downbeat correctly before the start mark", () => {
    // Four beats to the bar, so index -4 is a downbeat and -3 is not.
    const beats = beatsBetween(TWO_BARS, at(-4), at(-2));
    assert.deepEqual(
      beats.map((beat) => beat.accented),
      [true, false],
    );
  });

  it("keeps the pulse past the end mark", () => {
    const beats = beatsBetween(TWO_BARS, 14, 15);
    assert.deepEqual(
      beats.map((beat) => beat.index),
      [8, 9],
    );
  });

  it("gives nothing for a window that does not run forwards", () => {
    assert.deepEqual(beatsBetween(TWO_BARS, 12, 12), []);
    assert.deepEqual(beatsBetween(TWO_BARS, 12, 11), []);
  });
});
