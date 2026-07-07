import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pitch } from "../dist/music/pitch.js";
import { approxEqual } from "./helpers/approx-equal.js";

const F_SHARP_4 = new Pitch("F", 1, 4);
const G_FLAT_4 = new Pitch("G", -1, 4);

const SEMITONE_CASES = [
  { pitch: new Pitch("C", 0, 0), semitone: 0 },
  { pitch: new Pitch("C", 0, 2), semitone: 24 },
  { pitch: new Pitch("B", 0, 0), semitone: 11 },
  { pitch: new Pitch("F", 1, 4), semitone: 54 },
  { pitch: new Pitch("G", -1, 4), semitone: 54 },
  { pitch: new Pitch("C", -2, 3), semitone: 34 },
  { pitch: new Pitch("E", 2, 5), semitone: 66 },
  { pitch: new Pitch("D", -1, -1), semitone: -11 },
  { pitch: new Pitch("A", 0, 4), semitone: 57 },
] as const;

function chromaFromSemitone(semitone: number): number {
  return ((semitone % 12) + 12) % 12;
}

describe("Pitch", () => {
  it("constructor: throws TypeError when octave is not an integer", () => {
    assert.throws(
      () => new Pitch("C", 0, 4.5),
      (err: unknown) =>
        err instanceof TypeError && err.message === "octave must be an integer",
    );
  });

  it("toSemitone()", () => {
    for (const { pitch, semitone } of SEMITONE_CASES) {
      assert.equal(pitch.toSemitone(), semitone);
    }
  });

  it("toMidi()", () => {
    for (const { pitch, semitone } of SEMITONE_CASES) {
      assert.equal(pitch.toMidi(), semitone + 12);
    }
  });

  it("toChroma()", () => {
    for (const { pitch, semitone } of SEMITONE_CASES) {
      assert.equal(pitch.toChroma(), chromaFromSemitone(semitone));
    }
  });

  it("toFrequency()", () => {
    approxEqual(new Pitch("C", 0, 4).toFrequency(), 261.6255653005986);
    approxEqual(new Pitch("A", 0, 4).toFrequency(), 440);
    approxEqual(F_SHARP_4.toFrequency(), 369.99442271163446);
    approxEqual(G_FLAT_4.toFrequency(), 369.99442271163446);
    approxEqual(new Pitch("E", 0, 5).toFrequency(), 659.2551138257398);
    approxEqual(new Pitch("C", 0, 0).toFrequency(), 16.351597831287414);

    approxEqual(new Pitch("A", 0, 4).toFrequency(432), 432);
    approxEqual(new Pitch("C", 0, 4).toFrequency(432), 256.86873684058776);
  });

  it("isEqual()", () => {
    const baseline = F_SHARP_4;
    const same = F_SHARP_4;
    const differentOctave = new Pitch("F", 1, 5);
    const differentAccidental = new Pitch("F", 0, 4);
    const enharmonicSpelling = G_FLAT_4;

    assert.equal(baseline.isEqual(same), true);
    assert.equal(baseline.isEqual(differentOctave), false);
    assert.equal(baseline.isEqual(differentAccidental), false);
    assert.equal(baseline.isEqual(enharmonicSpelling), false);
  });

  it("isEnharmonicallyEqual()", () => {
    const baseline = F_SHARP_4;
    const same = F_SHARP_4;
    const differentOctave = new Pitch("F", 1, 5);
    const differentAccidental = new Pitch("F", 0, 4);
    const enharmonicSpelling = G_FLAT_4;

    assert.equal(baseline.isEnharmonicallyEqual(same), true);
    assert.equal(baseline.isEnharmonicallyEqual(differentOctave), false);
    assert.equal(baseline.isEnharmonicallyEqual(differentAccidental), false);
    assert.equal(baseline.isEnharmonicallyEqual(enharmonicSpelling), true);
  });

  it("toString()", () => {
    assert.equal(new Pitch("F", 1, 4).toString(), "f#4");
    assert.equal(new Pitch("G", -1, 3).toString(), "gb3");
    assert.equal(new Pitch("A", 0, 4).toString(), "a4");
    assert.equal(new Pitch("C", -2, 4).toString(), "cbb4");
    assert.equal(new Pitch("D", 2, 5).toString(), "d##5");
  });
});
