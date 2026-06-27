import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { Note, Rest, UnpitchedNote } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { vexFlowKeyFor } from "../dist/render/vex-key.js";

const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);
const WHOLE = new Duration(NoteValue.Whole);

describe("vexFlowKeyFor()", () => {
  it("spells a pitched note as letter, accidental and octave", () => {
    assert.equal(vexFlowKeyFor(new Note(new Pitch("C", 0, 4), QUARTER), "treble"), "c/4");
    assert.equal(vexFlowKeyFor(new Note(new Pitch("F", 1, 4), QUARTER), "treble"), "f#/4");
    assert.equal(vexFlowKeyFor(new Note(new Pitch("G", -1, 3), QUARTER), "treble"), "gb/3");
    assert.equal(vexFlowKeyFor(new Note(new Pitch("B", -2, 4), QUARTER), "treble"), "bbb/4");
    assert.equal(vexFlowKeyFor(new Note(new Pitch("D", 2, 5), QUARTER), "treble"), "d##/5");
  });

  it("puts a rest on the middle line of the clef", () => {
    assert.equal(vexFlowKeyFor(new Rest(QUARTER), "treble"), "b/4");
    assert.equal(vexFlowKeyFor(new Rest(QUARTER), "bass"), "d/3");
  });

  it("falls back to treble for a clef it does not know", () => {
    assert.equal(vexFlowKeyFor(new Rest(QUARTER), "alto"), "b/4");
  });

  it("asks for an X notehead on the middle line for a note awaiting a pitch", () => {
    // The third piece of a key string names a notehead glyph, and `x` leaves
    // VexFlow to pick the whole, half or black form from the duration — so one
    // suffix is right for every length.
    assert.equal(vexFlowKeyFor(new UnpitchedNote(QUARTER), "treble"), "b/4/x");
    assert.equal(vexFlowKeyFor(new UnpitchedNote(HALF), "treble"), "b/4/x");
    assert.equal(vexFlowKeyFor(new UnpitchedNote(WHOLE), "treble"), "b/4/x");
    assert.equal(vexFlowKeyFor(new UnpitchedNote(QUARTER), "bass"), "d/3/x");
  });

  it("puts an unpitched note where a rest would go, being equally undecided", () => {
    assert.equal(
      vexFlowKeyFor(new UnpitchedNote(QUARTER), "treble"),
      `${vexFlowKeyFor(new Rest(QUARTER), "treble")}/x`,
    );
  });
});
