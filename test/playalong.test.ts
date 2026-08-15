import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Duration,
  KeySignature,
  Melody,
  Note,
  NoteValue,
  Pitch,
  Rest,
  Tuplet,
  UnpitchedNote,
  type NoteEvent,
} from "../dist/music/index.js";
import { heldAt, notesBetween, soundingNotes } from "../dist/playback/playalong.js";

const C4 = new Pitch("C", 0, 4);
const E4 = new Pitch("E", 0, 4);
const G4 = new Pitch("G", 0, 4);

const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);
const EIGHTH = new Duration(NoteValue.Eighth);
const EIGHTH_TRIPLET = new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);

const C_MAJOR = new KeySignature(C4, "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;

const melodyOf = (events: readonly NoteEvent[]) =>
  new Melody(C_MAJOR, METER_4_4, events);

/** Whole notes from the head of the melody, as the walk reports them. */
const spanOf = (note: { start: number; end: number }) => [note.start, note.end];

describe("soundingNotes()", () => {
  it("gives each note its pitch and where it falls, in whole notes", () => {
    const notes = soundingNotes(
      melodyOf([
        new Note(C4, QUARTER),
        new Note(E4, HALF),
        new Note(G4, QUARTER),
      ]),
    );

    assert.deepEqual(
      notes.map((note) => [note.midi, ...spanOf(note)]),
      [
        [C4.toMidi(), 0, 0.25],
        [E4.toMidi(), 0.25, 0.75],
        [G4.toMidi(), 0.75, 1],
      ],
    );
  });

  it("passes over rests, which are the silence between the notes", () => {
    const notes = soundingNotes(
      melodyOf([
        new Note(C4, QUARTER),
        new Rest(HALF),
        new Note(E4, QUARTER),
      ]),
    );

    assert.deepEqual(
      notes.map((note) => [note.midi, note.start]),
      [
        [C4.toMidi(), 0],
        [E4.toMidi(), 0.75],
      ],
    );
  });

  it("passes over a note whose pitch is not chosen yet", () => {
    // Sounding a placeholder would mean choosing a pitch for it, which is the
    // one thing the person listening is trying to do.
    const notes = soundingNotes(
      melodyOf([
        new UnpitchedNote(QUARTER),
        new Note(E4, QUARTER),
        new UnpitchedNote(HALF),
      ]),
    );

    assert.deepEqual(notes.map((note) => note.midi), [E4.toMidi()]);
  });

  it("sounds a tied run once, for as long as the whole run lasts", () => {
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, HALF),
    ]);
    melody.tie(0);
    melody.tie(1);

    const notes = soundingNotes(melody);
    assert.equal(notes.length, 1);
    assert.deepEqual(spanOf(notes[0]!), [0, 1]);
  });

  it("sounds a tied run of unpitched notes not at all", () => {
    const melody = melodyOf([
      new UnpitchedNote(HALF),
      new UnpitchedNote(HALF),
    ]);
    melody.tie(0);

    assert.deepEqual(soundingNotes(melody), []);
  });

  it("takes a tuplet's sounding length, not its written one", () => {
    // Three eighths in the time of two fill a quarter between them, so each is
    // a twelfth of a whole note rather than an eighth.
    const melody = melodyOf([
      new Note(C4, EIGHTH_TRIPLET),
      new Note(E4, EIGHTH_TRIPLET),
      new Note(G4, EIGHTH_TRIPLET),
      new Note(C4, HALF),
      new Note(C4, QUARTER),
    ]);
    melody.groupTuplet(0, 3);

    const notes = soundingNotes(melody);
    assert.deepEqual(spanOf(notes[0]!), [0, 1 / 12]);
    assert.deepEqual(spanOf(notes[2]!), [1 / 6, 1 / 4]);
  });

  it("reads an empty melody as nothing to play", () => {
    assert.deepEqual(soundingNotes(melodyOf([new Rest(HALF), new Rest(HALF)])), []);
  });
});

describe("notesBetween()", () => {
  const notes = soundingNotes(
    melodyOf([
      new Note(C4, QUARTER),
      new Note(E4, QUARTER),
      new Note(G4, QUARTER),
      new Note(C4, QUARTER),
    ]),
  );

  /** Where each note starts, for reading the windows back. */
  const startsIn = (from: number, to: number) =>
    notesBetween(notes, from, to).map((note) => note.start);

  it("takes the notes beginning inside the window", () => {
    assert.deepEqual(startsIn(0.2, 0.8), [0.25, 0.5, 0.75]);
  });

  it("is half-open, so two windows meeting never sound a note twice", () => {
    // The property the scheduler leans on: it asks for one window after
    // another and keeps no record of what it has already played.
    assert.deepEqual(startsIn(0, 0.5), [0, 0.25]);
    assert.deepEqual(startsIn(0.5, 1), [0.5, 0.75]);
  });

  it("takes nothing from a window with no width, or one that runs backwards", () => {
    assert.deepEqual(startsIn(0.5, 0.5), []);
    assert.deepEqual(startsIn(0.75, 0.25), []);
  });

  it("ignores a note that began before the window, however long it lasts", () => {
    // Its start is what is scheduled, and that moment has gone.
    const held = soundingNotes(melodyOf([new Note(C4, HALF), new Note(E4, HALF)]));
    assert.deepEqual(notesBetween(held, 0.1, 0.4), []);
  });
});

describe("heldAt()", () => {
  const notes = soundingNotes(
    melodyOf([
      new Note(C4, QUARTER),
      new Rest(QUARTER),
      new Note(E4, HALF),
    ]),
  );

  const midiAt = (seconds: number) => heldAt(notes, seconds)?.midi;

  it("takes the note under way at that moment", () => {
    assert.equal(midiAt(0.1), C4.toMidi());
    assert.equal(midiAt(0.7), E4.toMidi());
  });

  it("takes nothing at a note's own start, which is the window's to play", () => {
    // The one property the scheduler leans on: a note beginning exactly where
    // the catching-up looks would otherwise be struck twice, once by each.
    assert.equal(midiAt(0), undefined);
    assert.equal(midiAt(0.5), undefined);
  });

  it("takes nothing once a note has run out", () => {
    assert.equal(midiAt(0.25), undefined);
    assert.equal(midiAt(1), undefined);
  });

  it("takes nothing in a silence", () => {
    assert.equal(midiAt(0.3), undefined);
  });

  it("holds a tied run for the whole of it", () => {
    const melody = melodyOf([new Note(C4, HALF), new Note(C4, HALF)]);
    melody.tie(0);
    const tied = soundingNotes(melody);
    // Halfway through the second half of the run, which is not a note of its
    // own and so has no start of its own to be looked up by.
    assert.equal(heldAt(tied, 0.75)?.midi, C4.toMidi());
  });

  it("takes nothing from a melody with nothing in it", () => {
    assert.equal(heldAt([], 0.5), undefined);
  });
});
