import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KeySignature } from "../dist/music/key-signature.js";
import { Pitch } from "../dist/music/pitch.js";

describe("KeySignature", () => {
  it("isEqual()", () => {
    const aMajor = new KeySignature(new Pitch("A", 0, 4), "major");
    const same = new KeySignature(new Pitch("A", 0, 4), "major");
    const differentOctave = new KeySignature(new Pitch("A", 0, 3), "major");
    const differentMode = new KeySignature(new Pitch("A", 0, 4), "minor");
    const differentSpelling = new KeySignature(new Pitch("G", 2, 4), "major");

    assert.equal(aMajor.isEqual(same), true);
    assert.equal(aMajor.isEqual(differentOctave), false);
    assert.equal(aMajor.isEqual(differentMode), false);
    assert.equal(aMajor.isEqual(differentSpelling), false);
  });

  it("isEnharmonicallyEqual()", () => {
    const cbbMinor = new KeySignature(new Pitch("C", -2, 4), "minor");
    const same = new KeySignature(new Pitch("C", -2, 4), "minor");
    const differentOctave = new KeySignature(new Pitch("C", -2, 3), "minor");
    const differentMode = new KeySignature(new Pitch("C", -2, 4), "major");
    const differentSpelling = new KeySignature(new Pitch("A", 1, 5), "minor");

    assert.equal(cbbMinor.isEnharmonicallyEqual(same), true);
    assert.equal(cbbMinor.isEnharmonicallyEqual(differentOctave), true);
    assert.equal(cbbMinor.isEnharmonicallyEqual(differentMode), false);
    assert.equal(cbbMinor.isEnharmonicallyEqual(differentSpelling), true);
  });

  it("fifths()", () => {
    // [tonic letter, tonic accidental, mode, position on the circle of fifths]
    const cases = [
      ["C", 0, "major", 0],
      ["G", 0, "major", 1],
      ["F", 0, "major", -1],
      ["A", -1, "major", -4],
      ["C", 1, "major", 7],
      ["C", -1, "major", -7],
      ["G", 1, "major", 8], // past the seven naturals, so a letter doubles
      ["A", 0, "minor", 0],
      ["C", 0, "minor", -3],
      ["E", 0, "minor", 1],
    ] as const;

    for (const [letter, accidental, mode, expected] of cases) {
      const key = new KeySignature(new Pitch(letter, accidental, 4), mode);
      assert.equal(key.fifths(), expected, key.toString());
    }
  });

  describe("alterationFor()", () => {
    const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;

    /**
     * The alteration each of `LETTERS` receives, in that order: -1 flat,
     * 0 natural, 1 sharp, 2 double-sharp.
     */
    const profile = (key: KeySignature) =>
      LETTERS.map((letter) => key.alterationFor(letter));

    it("A-flat major flattens B, E, A and D only", () => {
      const aFlat = new KeySignature(new Pitch("A", -1, 4), "major");
      assert.deepEqual(profile(aFlat), [0, -1, -1, 0, 0, -1, -1]);
    });

    it("G major sharpens F only", () => {
      const g = new KeySignature(new Pitch("G", 0, 4), "major");
      assert.deepEqual(profile(g), [0, 0, 0, 1, 0, 0, 0]);
    });

    it("C-sharp major sharpens every letter", () => {
      const cSharp = new KeySignature(new Pitch("C", 1, 4), "major");
      assert.deepEqual(profile(cSharp), [1, 1, 1, 1, 1, 1, 1]);
    });

    it("A minor alters nothing", () => {
      const aMinor = new KeySignature(new Pitch("A", 0, 4), "minor");
      assert.deepEqual(profile(aMinor), [0, 0, 0, 0, 0, 0, 0]);
    });

    it("G-sharp major doubles the sharp on F", () => {
      const gSharp = new KeySignature(new Pitch("G", 1, 4), "major");
      assert.deepEqual(profile(gSharp), [1, 1, 1, 2, 1, 1, 1]);
    });

    it("the tonic's own letter always carries the tonic's accidental", () => {
      for (const [letter, accidental] of [
        ["A", -1],
        ["F", 1],
        ["B", -1],
        ["C", 0],
      ] as const) {
        for (const mode of ["major", "minor"] as const) {
          const key = new KeySignature(new Pitch(letter, accidental, 4), mode);
          assert.equal(key.alterationFor(letter), accidental, key.toString());
        }
      }
    });

    it("throws when the key needs an alteration beyond a double accidental", () => {
      const absurd = new KeySignature(new Pitch("B", 2, 4), "major");
      assert.throws(() => absurd.alterationFor("F"), RangeError);
    });
  });

  it("toString()", () => {
    assert.equal(new KeySignature(new Pitch("A", 0, 4), "major").toString(), "A");
    assert.equal(new KeySignature(new Pitch("F", 1, 4), "major").toString(), "F#");
    assert.equal(new KeySignature(new Pitch("D", -1, 4), "minor").toString(), "Dbm");
    assert.equal(new KeySignature(new Pitch("E", 2, 4), "major").toString(), "E##");
    assert.equal(new KeySignature(new Pitch("C", -2, 4), "minor").toString(), "Cbbm");
  });
});
