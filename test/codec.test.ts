import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decode, encode } from "../dist/editor/codec.js";
import { normalize } from "../dist/editor/normalize.js";
import { divideIntoTuplet } from "../dist/editor/operations.js";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent, Rest, UnpitchedNote } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { Tuplet } from "../dist/music/tuplet.js";

const C4 = new Pitch("C", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);
const DOTTED_EIGHTH = new Duration(NoteValue.Eighth, 1);

const A_FLAT_MINOR = new KeySignature(new Pitch("A", -1, 4), "minor");
const METER_6_8 = { beats: 6, beatUnit: 8 } as const;
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;

const melodyOf = (events: readonly NoteEvent[]) =>
  new Melody(A_FLAT_MINOR, METER_4_4, events);

/** Through JSON and back, exactly as saving and loading would do it. */
const roundTrip = (melody: Melody) =>
  decode(JSON.parse(JSON.stringify(encode(melody))));

describe("encode() and decode()", () => {
  it("round-trips key, meter and every kind of event", () => {
    const melody = new Melody(A_FLAT_MINOR, METER_6_8, [
      new Note(new Pitch("B", -2, 3), DOTTED_EIGHTH),
      new UnpitchedNote(QUARTER),
      new Rest(HALF),
    ]);

    assert.equal(roundTrip(melody).isEqual(melody), true);
  });

  it("round-trips ties", () => {
    const melody = melodyOf([
      new Note(C4, HALF),
      new Note(C4, HALF),
      new Rest(HALF),
    ]);
    melody.tie(0);

    const back = roundTrip(melody);

    assert.equal(back.isEqual(melody), true);
    assert.equal(back.isTiedToNext(0), true);
    assert.equal(back.isTiedToNext(1), false);
  });

  it("round-trips tuplet brackets", () => {
    const melody = melodyOf([new Note(C4, QUARTER)]);
    normalize(melody);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    const back = roundTrip(melody);

    assert.equal(back.isEqual(melody), true);
    assert.deepEqual(
      back.tupletSpans().map(({ start, count, tuplet }) => ({
        start,
        count,
        ratio: tuplet.toString(),
      })),
      [{ start: 0, count: 3, ratio: "3:2" }],
    );
  });

  it("keeps the exact spelling, not merely the sound", () => {
    const melody = melodyOf([new Note(new Pitch("G", -1, 4), QUARTER)]);

    const back = roundTrip(melody);

    assert.equal((back.getEvent(0) as Note).pitch.toString(), "gb4");
    // The enharmonic would sound the same and be a different melody.
    assert.equal(
      back.isEqual(melodyOf([new Note(new Pitch("F", 1, 4), QUARTER)])),
      false,
    );
  });

  it("round-trips a melody with nothing in it", () => {
    const melody = melodyOf([]);

    assert.equal(roundTrip(melody).isEqual(melody), true);
  });

  it("produces plain data, so it survives storage as text", () => {
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new UnpitchedNote(HALF),
    ]);
    melody.tie(0);

    const text = JSON.stringify(encode(melody));

    assert.equal(typeof text, "string");
    assert.equal(decode(JSON.parse(text)).isEqual(melody), true);
  });
});
