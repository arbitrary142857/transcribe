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

  it("toString()", () => {
    assert.equal(new KeySignature(new Pitch("A", 0, 4), "major").toString(), "A");
    assert.equal(new KeySignature(new Pitch("F", 1, 4), "major").toString(), "F#");
    assert.equal(new KeySignature(new Pitch("D", -1, 4), "minor").toString(), "Dbm");
    assert.equal(new KeySignature(new Pitch("E", 2, 4), "major").toString(), "E##");
    assert.equal(new KeySignature(new Pitch("C", -2, 4), "minor").toString(), "Cbbm");
  });
});
