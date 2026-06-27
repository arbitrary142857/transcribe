import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalize } from "../dist/editor/normalize.js";
import {
  convertToRestAt,
  divideIntoTuplet,
  emptyMelody,
  ratiosOfferedAt,
  undivideTuplet,
  writeAt,
} from "../dist/editor/operations.js";
import { Duration, NoteValue, writeLength } from "../dist/music/duration.js";
import { Fraction } from "../dist/music/fraction.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { splitIntoMeasures } from "../dist/music/measure.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { Tuplet } from "../dist/music/tuplet.js";

const C4 = new Pitch("C", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);
const EIGHTH = new Duration(NoteValue.Eighth);
const DOTTED_QUARTER = new Duration(NoteValue.Quarter, 1);

const KEY = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;
const METER_6_8 = { beats: 6, beatUnit: 8 } as const;

const f = (num: number, den: number) => new Fraction(num, den);
const DUPLET = new Tuplet(2, 3);

function editable(
  events: readonly NoteEvent[],
  meter: typeof METER_4_4 | typeof METER_6_8 = METER_4_4,
): Melody {
  const melody = new Melody(KEY, meter, events);
  normalize(melody);
  return melody;
}

describe("writeLength()", () => {
  it("writes a length that one duration names", () => {
    assert.deepEqual(writeLength(f(1, 4)).map(String), ["/q"]);
    assert.deepEqual(writeLength(f(3, 8)).map(String), ["/q."]);
  });

  it("takes the longest that fits, repeatedly, for anything else", () => {
    assert.deepEqual(writeLength(f(5, 16)).map(String), ["/q", "/16"]);
    assert.deepEqual(writeLength(f(0, 1)).map(String), []);
  });

  it("throws RangeError for a length it cannot write at all", () => {
    // Inside a bracket the ratio is already divided out, so what is left must
    // be writable without one.
    assert.throws(() => writeLength(f(1, 12)), RangeError);
  });
});

describe("ratiosOfferedAt()", () => {
  it("offers a triplet and a quintuplet on a plain quarter", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    const offered = ratiosOfferedAt(melody, 0).map(String);

    // A quarter divided 3:2 gives eighths, and 5:4 gives sixteenths.
    assert.equal(offered.includes("3:2"), true);
    assert.equal(offered.includes("5:4"), true);
  });

  it("refuses a ratio whose members would have no name", () => {
    // A quarter divided 2:3 would give members of 1/12 written — no such note.
    const melody = editable([new Note(C4, QUARTER)]);

    assert.equal(ratiosOfferedAt(melody, 0).map(String).includes("2:3"), false);
  });

  it("offers a duplet on a dotted quarter, where it divides evenly", () => {
    const melody = editable([new Note(C4, DOTTED_QUARTER)], METER_6_8);

    assert.equal(ratiosOfferedAt(melody, 0).map(String).includes("2:3"), true);
  });

  it("offers nothing on an event already inside a bracket", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    assert.deepEqual(ratiosOfferedAt(melody, 1), []);
  });
});

describe("divideIntoTuplet()", () => {
  it("divides an event in place, keeping its total length", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    const before = splitIntoMeasures(melody).length;

    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    assert.equal(
      melody.toString(),
      "c4/8{3:2}, c4/8{3:2}, c4/8{3:2}, b4/q/r, b4/h/r, b4/w/r",
    );
    assert.equal(splitIntoMeasures(melody).length, before);
  });

  it("brackets the members straight away, so no half-made tuplet exists", () => {
    const melody = editable([new Note(C4, QUARTER)]);

    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    assert.deepEqual(
      melody.tupletSpans().map(({ start, count, tuplet }) => ({
        start,
        count,
        ratio: tuplet.toString(),
      })),
      [{ start: 0, count: 3, ratio: "3:2" }],
    );
  });

  it("keeps whatever the event was: a rest divides into rests", () => {
    const melody = emptyMelody(KEY, METER_4_4);
    writeAt(melody, 0, QUARTER, "note");

    // Index 1 is the quarter rest left over in the same bar.
    divideIntoTuplet(melody, 1, Tuplet.Triplet);

    assert.equal(
      melody.toString(),
      "x/q, b4/8{3:2}/r, b4/8{3:2}/r, b4/8{3:2}/r, b4/h/r, b4/w/r",
    );
  });

  it("divides a half into triplet quarters", () => {
    const melody = editable([new Note(C4, HALF)]);

    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    assert.equal(
      melody.toString(),
      "c4/q{3:2}, c4/q{3:2}, c4/q{3:2}, b4/h/r, b4/w/r",
    );
  });

  it("never lets a bracket cross a barline, being carved from one event", () => {
    const melody = editable([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ]);

    divideIntoTuplet(melody, 3, Tuplet.Triplet);

    assert.doesNotThrow(() => splitIntoMeasures(melody));
    assert.equal(splitIntoMeasures(melody)[0]!.tuplets.length, 1);
  });

  it("throws RangeError for a ratio that does not divide evenly", () => {
    const melody = editable([new Note(C4, QUARTER)]);

    assert.throws(() => divideIntoTuplet(melody, 0, DUPLET), RangeError);
  });

  it("throws RangeError inside a bracket, since brackets do not nest", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    assert.throws(() => divideIntoTuplet(melody, 0, Tuplet.Triplet), RangeError);
  });
});

describe("undivideTuplet()", () => {
  it("is the exact inverse of dividing", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    const before = melody.toString();

    divideIntoTuplet(melody, 0, Tuplet.Triplet);
    undivideTuplet(melody, 1);

    assert.equal(melody.toString(), before);
  });

  it("restores what the first member was", () => {
    const melody = emptyMelody(KEY, METER_4_4);
    writeAt(melody, 0, QUARTER, "note");
    divideIntoTuplet(melody, 1, Tuplet.Triplet);

    undivideTuplet(melody, 2);

    // The bracket was made of rests, so a rest is what comes back.
    assert.equal(melody.toString(), "x/q, b4/q/r, b4/h/r, b4/w/r");
  });

  it("leaves no bracket behind", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    undivideTuplet(melody, 0);

    assert.deepEqual(melody.tupletSpans(), []);
  });

  it("throws RangeError when nothing there is bracketed", () => {
    const melody = editable([new Note(C4, QUARTER)]);

    assert.throws(() => undivideTuplet(melody, 0), RangeError);
  });
});

describe("editing inside a bracket", () => {
  it("turns a member into a rest without breaking the bracket", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    convertToRestAt(melody, 1);

    assert.equal(
      melody.toString(),
      "c4/8{3:2}, b4/8{3:2}/r, c4/8{3:2}, b4/q/r, b4/h/r, b4/w/r",
    );
    assert.deepEqual(
      melody.tupletSpans().map(({ start, count }) => ({ start, count })),
      [{ start: 0, count: 3 }],
    );
    assert.doesNotThrow(() => splitIntoMeasures(melody));
  });

  it("will not swallow a neighbouring member that is still a note", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    // Growing takes rest space, never music — inside a bracket as anywhere.
    assert.throws(
      () =>
        writeAt(
          melody,
          0,
          new Duration(NoteValue.Quarter, 0, Tuplet.Triplet),
          "note",
        ),
      RangeError,
    );
  });

  it("merges two members once the room has been freed", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);
    convertToRestAt(melody, 1);

    // A triplet quarter takes the room of two triplet eighths.
    writeAt(melody, 0, new Duration(NoteValue.Quarter, 0, Tuplet.Triplet), "note");

    assert.equal(
      melody.toString(),
      "c4/q{3:2}, c4/8{3:2}, b4/q/r, b4/h/r, b4/w/r",
    );
    assert.deepEqual(
      melody.tupletSpans().map(({ start, count }) => ({ start, count })),
      [{ start: 0, count: 2 }],
    );
    assert.doesNotThrow(() => splitIntoMeasures(melody));
  });

  it("does not let a member grow past the bracket", () => {
    const melody = editable([new Note(C4, QUARTER), new Note(C4, QUARTER)]);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);

    assert.throws(
      () =>
        writeAt(melody, 0, new Duration(NoteValue.Half, 0, Tuplet.Triplet), "note"),
      RangeError,
    );
  });

  it("collapses the bracket when one member fills the whole of it", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    divideIntoTuplet(melody, 0, Tuplet.Triplet);
    convertToRestAt(melody, 1);
    convertToRestAt(melody, 2);

    // Filling the bracket with one member leaves a ratio over a single note,
    // which says nothing — so it comes back as an ordinary quarter.
    writeAt(melody, 0, new Duration(NoteValue.Quarter, 1, Tuplet.Triplet), "note");

    assert.deepEqual(melody.tupletSpans(), []);
    assert.equal(melody.toString(), "c4/q, b4/q/r, b4/h/r, b4/w/r");
    assert.doesNotThrow(() => splitIntoMeasures(melody));
  });

  it("keeps every bar full through a run of bracket edits", () => {
    const melody = editable([new Note(C4, QUARTER)]);
    const tripletEighth = new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);

    divideIntoTuplet(melody, 0, Tuplet.Triplet);
    convertToRestAt(melody, 1);
    writeAt(melody, 1, tripletEighth, "note");
    convertToRestAt(melody, 2);

    assert.doesNotThrow(() => splitIntoMeasures(melody));
  });
});
