import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalize } from "../dist/editor/normalize.js";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { splitIntoMeasures } from "../dist/music/measure.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent, Rest } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { Tuplet } from "../dist/music/tuplet.js";

const C4 = new Pitch("C", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);
const WHOLE = new Duration(NoteValue.Whole);
const EIGHTH_TRIPLET = new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);

const KEY = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;
const METER_3_4 = { beats: 3, beatUnit: 4 } as const;

const quarter = () => new Note(C4, QUARTER);
const melodyOf = (
  events: readonly NoteEvent[],
  meter: typeof METER_4_4 | typeof METER_3_4 = METER_4_4,
) => new Melody(KEY, meter, events);

/** Normalize and report the result, which every test here reads. */
function normalized(
  events: readonly NoteEvent[],
  meter: typeof METER_4_4 | typeof METER_3_4 = METER_4_4,
): string {
  const melody = melodyOf(events, meter);
  normalize(melody);
  return melody.toString();
}

describe("normalize()", () => {
  it("gives an empty melody one bar of rests to write into", () => {
    assert.equal(normalized([]), "b4/w/r");
  });

  it("writes that opening bar to suit the meter", () => {
    // Three quarters of silence, which is what a 3/4 bar holds.
    assert.equal(normalized([], METER_3_4), "b4/h./r");
  });

  it("keeps one spare bar past the last note", () => {
    assert.equal(
      normalized([quarter(), quarter(), quarter(), quarter()]),
      "c4/q, c4/q, c4/q, c4/q, b4/w/r",
    );
  });

  it("trims the spare bars back to one", () => {
    assert.equal(
      normalized([
        quarter(),
        quarter(),
        quarter(),
        quarter(),
        new Rest(WHOLE),
        new Rest(WHOLE),
        new Rest(WHOLE),
      ]),
      "c4/q, c4/q, c4/q, c4/q, b4/w/r",
    );
  });

  it("drops every bar of rests when there is no music at all", () => {
    assert.equal(normalized([new Rest(WHOLE), new Rest(WHOLE)]), "b4/w/r");
  });

  it("fills out a bar the music left half written", () => {
    assert.equal(
      normalized([quarter()]),
      "c4/q, b4/q/r, b4/h/r, b4/w/r",
    );
  });

  it("merges neighbouring rests into how they should be written", () => {
    // Three quarter rests from beat two are a quarter rest and then a half.
    assert.equal(
      normalized([quarter(), new Rest(QUARTER), new Rest(QUARTER), new Rest(QUARTER)]),
      "c4/q, b4/q/r, b4/h/r, b4/w/r",
    );
  });

  it("never merges rests across a barline", () => {
    assert.equal(
      normalized([new Note(C4, HALF), new Rest(HALF), new Rest(WHOLE)]),
      "c4/h, b4/h/r, b4/w/r",
    );
  });

  it("leaves the rests inside a tuplet alone", () => {
    const melody = melodyOf([
      new Note(C4, EIGHTH_TRIPLET),
      new Rest(EIGHTH_TRIPLET),
      new Note(C4, EIGHTH_TRIPLET),
      new Rest(QUARTER),
      new Rest(QUARTER),
      new Rest(QUARTER),
    ]);
    melody.groupTuplet(0, 3);

    normalize(melody);

    // The bracket's own rest keeps its ratio; only the plain rests are rewritten.
    assert.equal(
      melody.toString(),
      "c4/8{3:2}, b4/8{3:2}/r, c4/8{3:2}, b4/q/r, b4/h/r, b4/w/r",
    );
    assert.deepEqual(
      melody.tupletSpans().map(({ start, count }) => ({ start, count })),
      [{ start: 0, count: 3 }],
    );
  });

  it("keeps ties across the events it adds", () => {
    const melody = melodyOf([new Note(C4, HALF), new Note(C4, HALF)]);
    melody.tie(0);

    normalize(melody);

    assert.equal(melody.isTiedToNext(0), true);
    assert.equal(melody.toString(), "c4/h, c4/h, b4/w/r");
  });

  it("leaves an already-normalized melody untouched", () => {
    const melody = melodyOf([quarter()]);
    normalize(melody);
    const once = melody.toString();
    normalize(melody);

    assert.equal(melody.toString(), once);
  });

  it("keeps every bar exactly full", () => {
    // splitIntoMeasures is what both rendering and spelling go through, and it
    // throws on a bar that is short or overfull. Surviving it is the invariant
    // the whole editor rests on, so check it on shapes that start out broken.
    const cases: [readonly NoteEvent[], typeof METER_4_4 | typeof METER_3_4][] =
      [
        [[], METER_4_4],
        [[], METER_3_4],
        [[quarter()], METER_4_4],
        [[quarter(), new Rest(QUARTER)], METER_3_4],
        [[new Note(C4, HALF), quarter()], METER_3_4],
        [[quarter(), quarter(), quarter(), quarter(), quarter()], METER_4_4],
      ];

    for (const [events, meter] of cases) {
      const melody = melodyOf(events, meter);
      normalize(melody);
      assert.doesNotThrow(
        () => splitIntoMeasures(melody),
        `${meter.beats}/${meter.beatUnit}: ${melody}`,
      );
    }
  });

  it("fills a short final bar in a meter of three", () => {
    assert.equal(
      normalized([quarter(), new Rest(QUARTER)], METER_3_4),
      "c4/q, b4/q/r, b4/q/r, b4/h./r",
    );
  });
});
