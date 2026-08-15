import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SAMPLE_RATE,
  pianoToneSeconds,
  writePianoTone,
  writeTone,
} from "../dist/music/synthesis.js";

/** Middle C and the A above it, as the piano would be asked for them. */
const C4_HZ = 261.6255653005986;
const A4_HZ = 440;

const rendered = (
  frequency: number,
  seconds = 1,
  rate = 8000,
): Float32Array => {
  const buffer = new Float32Array(Math.ceil(seconds * rate));
  writePianoTone(buffer, 0, frequency, seconds, rate);
  return buffer;
};

/** Mean square over a slice, which is what "how loud is it here" means. */
function energy(buffer: Float32Array, from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to; i++) {
    total += buffer[i]! ** 2;
  }
  return total / (to - from);
}

const peak = (buffer: Float32Array) =>
  buffer.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0);

describe("writePianoTone()", () => {
  it("stays inside the range a sample can hold", () => {
    // Anything past ±1 is clipped by the hardware, and a piano note is a dozen
    // partials summed — so the total is scaled rather than left to chance.
    for (const hz of [55, 110, C4_HZ, A4_HZ, 1760]) {
      assert.ok(peak(rendered(hz)) <= 1, `${hz} Hz peaked at ${peak(rendered(hz))}`);
    }
  });

  it("actually makes a sound", () => {
    assert.ok(peak(rendered(C4_HZ)) > 0.05);
  });

  it("decays from the moment it is struck", () => {
    // A struck string has no sustain: it is loudest at the start and quieter
    // every moment after. This is the shape `writeTone`'s flat-topped envelope
    // does not have, and most of why that one reads as a test signal.
    const buffer = rendered(C4_HZ, 2);
    const tenth = Math.floor(buffer.length / 10);
    const first = energy(buffer, 0, tenth);
    const middle = energy(buffer, tenth * 4, tenth * 5);
    const last = energy(buffer, tenth * 9, buffer.length);

    assert.ok(first > middle, "the opening should be louder than the middle");
    assert.ok(middle > last, "the middle should be louder than the tail");
  });

  it("ends at silence, so a note can be cut off without a click", () => {
    const buffer = rendered(C4_HZ);
    assert.ok(Math.abs(buffer[buffer.length - 1]!) < 0.01);
  });

  it("opens fast, but not so fast that the first sample is a step", () => {
    // A struck string reaches full volume in a few milliseconds. Starting at
    // full volume instead puts a discontinuity at sample zero, which is a click.
    const buffer = rendered(C4_HZ);
    assert.ok(Math.abs(buffer[0]!) < 0.05);
  });

  it("lets the treble go before the bass, as a piano does", () => {
    // Short strings shed their energy far faster than long ones, and a synth
    // that ignores it sounds like an organ playing staccato.
    const share = (hz: number) => {
      const buffer = rendered(hz, 2);
      const tenth = Math.floor(buffer.length / 10);
      return energy(buffer, tenth * 8, tenth * 9) / energy(buffer, 0, tenth);
    };
    assert.ok(
      share(110) > share(1760),
      "a low note should keep more of its loudness than a high one",
    );
  });

  it("writes where it is told, and not before", () => {
    const buffer = new Float32Array(4000);
    buffer.fill(0.5, 0, 1000);
    writePianoTone(buffer, 1000, C4_HZ, 0.2, 8000);

    for (let i = 0; i < 1000; i++) {
      assert.equal(buffer[i], 0.5, `sample ${i} was written over`);
    }
    assert.ok(peak(buffer.subarray(1000)) > 0.05);
  });

  it("adds to what is already there rather than replacing it", () => {
    // The same rule `writeTone` follows, and what lets two notes overlap.
    const alone = rendered(C4_HZ, 0.2);
    const over = new Float32Array(alone.length).fill(0.1);
    writePianoTone(over, 0, C4_HZ, 0.2, 8000);

    for (let i = 0; i < alone.length; i++) {
      assert.ok(Math.abs(over[i]! - (alone[i]! + 0.1)) < 1e-6);
    }
  });

  it("stops at the end of the buffer rather than past it", () => {
    const buffer = new Float32Array(500);
    writePianoTone(buffer, 400, C4_HZ, 1, 8000);
    assert.equal(buffer.length, 500);
  });

  it("renders the same note the same way every time", () => {
    // Including the noise of the hammer, which is drawn from the pitch rather
    // than at random — so a cached buffer and a fresh one cannot differ.
    assert.deepEqual(rendered(A4_HZ, 0.3), rendered(A4_HZ, 0.3));
  });

  it("refuses a length that is not a length", () => {
    const buffer = new Float32Array(100);
    assert.throws(
      () => writePianoTone(buffer, 0, C4_HZ, -1, 8000),
      (error: unknown) => error instanceof RangeError,
    );
  });
});

describe("pianoToneSeconds()", () => {
  it("gives a low note longer to die away than a high one", () => {
    assert.ok(pianoToneSeconds(55) > pianoToneSeconds(1760));
  });

  it("stays within bounds worth holding a buffer for", () => {
    for (const hz of [27.5, 55, A4_HZ, 4186]) {
      const seconds = pianoToneSeconds(hz);
      assert.ok(seconds > 0.2 && seconds <= 4, `${hz} Hz asked for ${seconds}s`);
    }
  });
});

describe("writeTone()", () => {
  it("still writes the plain tone the metronome clicks with", () => {
    // Unchanged by the piano living alongside it: the clicks are built from
    // this one, and a click that turned into a piano note would be a worse
    // click.
    const buffer = new Float32Array(Math.ceil(0.05 * SAMPLE_RATE));
    writeTone(buffer, 0, 1600, 0.05);
    assert.ok(peak(buffer) > 0.1);
  });
});
