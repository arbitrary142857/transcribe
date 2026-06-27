import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalize } from "../dist/editor/normalize.js";
import { divideIntoTuplet, emptyMelody, writeAt } from "../dist/editor/operations.js";
import { hasMusic, withKeySignature } from "../dist/editor/signature.js";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { Tuplet } from "../dist/music/tuplet.js";

const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);

const C_MAJOR = new KeySignature(new Pitch("C", 0, 4), "major");
const E_MAJOR = new KeySignature(new Pitch("E", 0, 4), "major");
const D_FLAT_MAJOR = new KeySignature(new Pitch("D", -1, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;

function editable(events: readonly NoteEvent[], key = C_MAJOR): Melody {
  const melody = new Melody(key, METER_4_4, events);
  normalize(melody);
  return melody;
}

describe("hasMusic()", () => {
  it("is false while nothing but rests has been written", () => {
    assert.equal(hasMusic(emptyMelody(C_MAJOR, METER_4_4)), false);
  });

  it("becomes true once anything is written", () => {
    const melody = emptyMelody(C_MAJOR, METER_4_4);
    writeAt(melody, 0, QUARTER, "note");

    assert.equal(hasMusic(melody), true);
  });
});

describe("withKeySignature()", () => {
  it("carries the events across unchanged in sound", () => {
    const melody = editable([
      new Note(new Pitch("F", 1, 4), QUARTER),
      new Note(new Pitch("G", 0, 4), QUARTER),
    ]);

    const moved = withKeySignature(melody, E_MAJOR);

    assert.equal(moved.keySignature.isEqual(E_MAJOR), true);
    assert.equal(moved.eventCount, melody.eventCount);
    for (let i = 0; i < melody.eventCount; i++) {
      assert.equal(
        moved.getEvent(i).isEnharmonicallyEqual(melody.getEvent(i)),
        true,
      );
    }
  });

  it("respells notes to suit the new key, without moving them", () => {
    // C-sharp written in a sharp key should come out as D-flat in a flat one:
    // the same sound, spelled the way the new key already covers.
    const melody = editable([new Note(new Pitch("C", 1, 5), HALF)], E_MAJOR);

    const moved = withKeySignature(melody, D_FLAT_MAJOR);

    const respelled = moved.getEvent(0);
    assert.equal(respelled instanceof Note, true);
    assert.equal((respelled as Note).pitch.toString(), "db5");
    assert.equal((respelled as Note).pitch.toMidi(), 73);
  });

  it("leaves a note the new key already covers alone", () => {
    const melody = editable([new Note(new Pitch("F", 1, 4), HALF)], C_MAJOR);

    const moved = withKeySignature(melody, E_MAJOR);

    // E major already sharpens F, so F-sharp stays exactly as it was.
    assert.equal((moved.getEvent(0) as Note).pitch.toString(), "f#4");
  });

  it("carries ties across", () => {
    const melody = editable([
      new Note(new Pitch("C", 0, 4), HALF),
      new Note(new Pitch("C", 0, 4), HALF),
    ]);
    melody.tie(0);

    const moved = withKeySignature(melody, E_MAJOR);

    assert.equal(moved.isTiedToNext(0), true);
    assert.deepEqual(moved.getTiedGroup(1), [0, 1]);
  });

  it("carries tuplet brackets across", () => {
    const melody = editable([new Note(new Pitch("C", 0, 4), QUARTER)]);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    const moved = withKeySignature(melody, E_MAJOR);

    assert.deepEqual(
      moved.tupletSpans().map(({ start, count, tuplet }) => ({
        start,
        count,
        ratio: tuplet.toString(),
      })),
      [{ start: 0, count: 3, ratio: "3:2" }],
    );
  });

  it("leaves the melody it was given untouched", () => {
    const melody = editable([new Note(new Pitch("C", 1, 5), HALF)], E_MAJOR);
    const before = melody.toString();

    withKeySignature(melody, D_FLAT_MAJOR);

    assert.equal(melody.toString(), before);
    assert.equal(melody.keySignature.isEqual(E_MAJOR), true);
  });
});
