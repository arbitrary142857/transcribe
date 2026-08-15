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

  it("spells an unpitched note with the alteration already in force there", () => {
    // The X has no pitch, so the letter it borrows from the middle line must not
    // assert one. VexFlow reads the letter, finds no accidental on it, and takes
    // that as a claim that the note is natural — so in a key that flattens the
    // middle line it prints a ♮ in front of the X, and worse, records the letter
    // as natural for the rest of the bar, which makes the next real B♭ print a
    // flat it does not need. Spelling the placeholder to agree with what is
    // already in force says nothing new, and so prints nothing.
    assert.equal(
      vexFlowKeyFor(new UnpitchedNote(QUARTER), "treble", -1),
      "bb/4/x",
    );
    assert.equal(
      vexFlowKeyFor(new UnpitchedNote(QUARTER), "treble", 1),
      "b#/4/x",
    );
    assert.equal(
      vexFlowKeyFor(new UnpitchedNote(QUARTER), "bass", -1),
      "db/3/x",
    );
  });

  it("leaves the placeholder bare when nothing is in force", () => {
    // A natural is the absence of a mark, not a mark of its own: writing `bn`
    // here would be VexFlow's own way of asking for a printed ♮.
    assert.equal(vexFlowKeyFor(new UnpitchedNote(QUARTER), "treble", 0), "b/4/x");
    assert.equal(vexFlowKeyFor(new UnpitchedNote(QUARTER), "treble"), "b/4/x");
  });

  it("does not put an alteration on a rest, which has no letter to alter", () => {
    // A rest is skipped by VexFlow's accidental pass outright, so it never
    // claims anything about the bar and needs no help not to.
    assert.equal(vexFlowKeyFor(new Rest(QUARTER), "treble", -1), "b/4");
  });
});
