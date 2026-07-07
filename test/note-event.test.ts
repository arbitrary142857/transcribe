import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { Note, Rest } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";

const C4 = new Pitch("C", 0, 4);
const F_SHARP_4 = new Pitch("F", 1, 4);
const G_FLAT_4 = new Pitch("G", -1, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const DOTTED_QUARTER = new Duration(NoteValue.Quarter, 1);
const HALF = new Duration(NoteValue.Half);

describe("Note", () => {
  it("isEqual()", () => {
    const baseline = new Note(F_SHARP_4, QUARTER);
    const same = new Note(F_SHARP_4, QUARTER);
    const differentOctave = new Note(new Pitch("F", 1, 5), QUARTER);
    const differentDuration = new Note(F_SHARP_4, HALF);
    const enharmonicSpelling = new Note(G_FLAT_4, QUARTER);
    const rest = new Rest(QUARTER);

    assert.equal(baseline.isEqual(same), true);
    assert.equal(baseline.isEqual(differentOctave), false);
    assert.equal(baseline.isEqual(differentDuration), false);
    assert.equal(baseline.isEqual(enharmonicSpelling), false);
    assert.equal(baseline.isEqual(rest), false);
  });

  it("isEnharmonicallyEqual()", () => {
    const baseline = new Note(F_SHARP_4, QUARTER);
    const same = new Note(F_SHARP_4, QUARTER);
    const differentOctave = new Note(new Pitch("F", 1, 5), QUARTER);
    const differentDuration = new Note(F_SHARP_4, HALF);
    const enharmonicSpelling = new Note(G_FLAT_4, QUARTER);
    const rest = new Rest(QUARTER);

    assert.equal(baseline.isEnharmonicallyEqual(same), true);
    assert.equal(baseline.isEnharmonicallyEqual(differentOctave), false);
    assert.equal(baseline.isEnharmonicallyEqual(differentDuration), false);
    assert.equal(baseline.isEnharmonicallyEqual(enharmonicSpelling), true);
    assert.equal(baseline.isEnharmonicallyEqual(rest), false);
  });

  it("toString()", () => {
    assert.equal(new Note(C4, QUARTER).toString(), "c4/q");
    assert.equal(new Note(F_SHARP_4, DOTTED_QUARTER).toString(), "f#4/q.");
  });
});

describe("Rest", () => {
  it("isEqual()", () => {
    const baseline = new Rest(QUARTER);
    const same = new Rest(QUARTER);
    const differentDuration = new Rest(HALF);
    const note = new Note(C4, QUARTER);

    assert.equal(baseline.isEqual(same), true);
    assert.equal(baseline.isEqual(differentDuration), false);
    assert.equal(baseline.isEqual(note), false);
  });

  it("isEnharmonicallyEqual()", () => {
    const baseline = new Rest(QUARTER);
    const same = new Rest(QUARTER);
    const differentDuration = new Rest(HALF);
    const note = new Note(C4, QUARTER);

    assert.equal(baseline.isEnharmonicallyEqual(same), true);
    assert.equal(baseline.isEnharmonicallyEqual(differentDuration), false);
    assert.equal(baseline.isEnharmonicallyEqual(note), false);
  });

  it("toString()", () => {
    assert.equal(new Rest(QUARTER).toString(), "b4/q/r");
    assert.equal(new Rest(HALF).toString(), "b4/h/r");
    assert.equal(new Rest(DOTTED_QUARTER).toString(), "b4/q/r.");
  });
});
