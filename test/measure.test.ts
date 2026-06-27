import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Duration,
  KeySignature,
  Melody,
  Note,
  NoteValue,
  Pitch,
  Tuplet,
  type NoteEvent,
} from "../dist/music/index.js";
import {
  IncompleteMeasureError,
  MeasureOverflowError,
  TupletAcrossBarlineError,
  UngroupedTupletError,
  splitIntoMeasures,
} from "../dist/music/measure.js";

const C4 = new Pitch("C", 0, 4);
const D4 = new Pitch("D", 0, 4);
const E4 = new Pitch("E", 0, 4);
const F4 = new Pitch("F", 0, 4);
const G4 = new Pitch("G", 0, 4);
const A4 = new Pitch("A", 0, 4);
const C5 = new Pitch("C", 0, 5);

const WHOLE = new Duration(NoteValue.Whole);
const HALF = new Duration(NoteValue.Half);
const DOTTED_HALF = new Duration(NoteValue.Half, 1);
const QUARTER = new Duration(NoteValue.Quarter);
const DOTTED_QUARTER = new Duration(NoteValue.Quarter, 1);
const EIGHTH = new Duration(NoteValue.Eighth);
const DOTTED_EIGHTH = new Duration(NoteValue.Eighth, 1);
const SIXTEENTH = new Duration(NoteValue.Sixteenth);
const DOTTED_SIXTEENTH = new Duration(NoteValue.Sixteenth, 1);
const EIGHTH_TRIPLET = new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);

const KEY_C_MAJOR = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;
const METER_3_8 = { beats: 3, beatUnit: 8 } as const;

function makeMelody(
  timeSignature: { beats: number; beatUnit: number },
  events: readonly NoteEvent[],
): Melody {
  return new Melody(KEY_C_MAJOR, timeSignature, events);
}

const FOUR_FOUR_MELODY: NoteEvent[] = [
  // 1/12 1/12 1/12 1/8. 1/4 1/8 1/16 1/8
  new Note(E4, EIGHTH_TRIPLET),
  new Note(G4, EIGHTH_TRIPLET),
  new Note(G4, EIGHTH_TRIPLET),
  new Note(G4, DOTTED_EIGHTH),
  new Note(C5, QUARTER),
  new Note(D4, EIGHTH),
  new Note(F4, SIXTEENTH),
  new Note(A4, EIGHTH),
  // 1
  new Note(A4, WHOLE),
  // 1/12 1/12 1/12 1/8 1/16 1/16 1/8 1/4.
  new Note(A4, EIGHTH_TRIPLET),
  new Note(D4, EIGHTH_TRIPLET),
  new Note(D4, EIGHTH_TRIPLET),
  new Note(E4, EIGHTH),
  new Note(E4, SIXTEENTH),
  new Note(F4, SIXTEENTH),
  new Note(F4, EIGHTH),
  new Note(F4, DOTTED_QUARTER),
  // 1/4 1/2.
  new Note(F4, QUARTER),
  new Note(E4, DOTTED_HALF),
];

/** Triplets in `FOUR_FOUR_MELODY`, by start index. */
const FOUR_FOUR_TRIPLETS = [0, 9];

const THREE_EIGHT_MELODY: NoteEvent[] = [
  // 1/12 1/12 1/12 1/8
  new Note(C4, EIGHTH_TRIPLET),
  new Note(D4, EIGHTH_TRIPLET),
  new Note(E4, EIGHTH_TRIPLET),
  new Note(E4, EIGHTH),
  // 1/4.
  new Note(E4, DOTTED_QUARTER),
  // 1/12 1/12 1/12 1/16 1/16
  new Note(E4, EIGHTH_TRIPLET),
  new Note(F4, EIGHTH_TRIPLET),
  new Note(F4, EIGHTH_TRIPLET),
  new Note(G4, SIXTEENTH),
  new Note(G4, SIXTEENTH),
  // 1/8. 1/8.
  new Note(G4, DOTTED_EIGHTH),
  new Note(G4, DOTTED_EIGHTH),
];

/** Triplets in `THREE_EIGHT_MELODY`, by start index. */
const THREE_EIGHT_TRIPLETS = [0, 5];

function makeGroupedMelody(
  timeSignature: { beats: number; beatUnit: number },
  events: readonly NoteEvent[],
  tripletStarts: readonly number[],
): Melody {
  const melody = makeMelody(timeSignature, events);
  for (const start of tripletStarts) {
    melody.groupTuplet(start, 3);
  }
  return melody;
}

describe("splitIntoMeasures()", () => {
  it("four measures of 4/4, no ties", () => {
    const measures = splitIntoMeasures(makeGroupedMelody(METER_4_4, FOUR_FOUR_MELODY, FOUR_FOUR_TRIPLETS));

    assert.equal(measures.length, 4);
    assert.deepEqual(
      measures.map((measure) => measure.startIndex),
      [0, 8, 9, 17],
    );
    assert.deepEqual(
      measures.map((measure) => measure.events.length),
      [8, 1, 8, 2],
    );
    assert.equal(measures.every((measure) => measure.tiedToNextBar === false), true);
    assert.equal(measures.every((measure) => measure.tiedToPrevBar === false), true);
  });

  it("four measures of 4/4, barline ties", () => {
    const melody = makeGroupedMelody(METER_4_4, FOUR_FOUR_MELODY, FOUR_FOUR_TRIPLETS);
    for (const index of [1, 2, 10, 12, 14, 15, 7, 8, 16]) {
      melody.tie(index);
    }

    const measures = splitIntoMeasures(melody);

    assert.equal(measures.length, 4);
    assert.equal(measures[0]!.tiedToNextBar, true);
    assert.equal(measures[0]!.tiedToNext.has(7), false);
    assert.equal(measures[0]!.tiedToNext.has(1), true);
    assert.equal(measures[0]!.tiedToNext.has(2), true);
    assert.equal(measures[0]!.tiedToNext.size, 2);

    assert.equal(measures[1]!.tiedToPrevBar, true);
    assert.equal(measures[1]!.tiedToNextBar, true);
    assert.equal(measures[1]!.tiedToNext.size, 0);

    assert.equal(measures[2]!.tiedToPrevBar, true);
    assert.equal(measures[2]!.tiedToNextBar, true);
    assert.equal(measures[2]!.tiedToNext.has(0), false);
    assert.equal(measures[2]!.tiedToNext.has(1), true);
    assert.equal(measures[2]!.tiedToNext.has(3), true);
    assert.equal(measures[2]!.tiedToNext.has(5), true);
    assert.equal(measures[2]!.tiedToNext.has(6), true);
    assert.equal(measures[2]!.tiedToNext.has(7), false);
    assert.equal(measures[2]!.tiedToNext.size, 4);

    assert.equal(measures[3]!.tiedToPrevBar, true);
    assert.equal(measures[3]!.tiedToNextBar, false);
    assert.equal(measures[3]!.tiedToNext.size, 0);
  });

  it("throws MeasureOverflowError", () => {
    const melody = makeGroupedMelody(METER_4_4, FOUR_FOUR_MELODY, FOUR_FOUR_TRIPLETS);
    melody.setDuration(6, DOTTED_SIXTEENTH); // lengthen bar-1's 1/16 to 1/16.

    assert.throws(
      () => splitIntoMeasures(melody),
      (err: unknown) => {
        if (!(err instanceof MeasureOverflowError)) {
          return false;
        }
        assert.equal(err.eventIndex, 7);
        assert.equal(err.measureStartIndex, 0);
        assert.equal(err.overflow.num, 1);
        assert.equal(err.overflow.den, 32);
        return true;
      },
    );
  });

  it("throws IncompleteMeasureError", () => {
    const melody = makeGroupedMelody(METER_4_4, FOUR_FOUR_MELODY, FOUR_FOUR_TRIPLETS);
    melody.setDuration(18, HALF); // shorten bar-4's 1/2. to 1/2

    assert.throws(
      () => splitIntoMeasures(melody),
      (err: unknown) => {
        if (!(err instanceof IncompleteMeasureError)) {
          return false;
        }
        assert.notEqual(err, MeasureOverflowError);
        assert.equal(err.measureStartIndex, 17); // bar 4
        assert.equal(err.filled.num, 3);
        assert.equal(err.filled.den, 4);
        assert.equal(err.needed.num, 1);
        assert.equal(err.needed.den, 4);
        return true;
      },
    );
  });

  it("four measures of 3/8, barline ties", () => {
    const melody = makeGroupedMelody(METER_3_8, THREE_EIGHT_MELODY, THREE_EIGHT_TRIPLETS);
    for (const index of [2, 3, 4, 6, 8, 9, 10]) {
      melody.tie(index);
    }

    const measures = splitIntoMeasures(melody);

    assert.equal(measures.length, 4);
    assert.deepEqual(
      measures.map((measure) => measure.startIndex),
      [0, 4, 5, 10],
    );
    assert.deepEqual(
      measures.map((measure) => measure.events.length),
      [4, 1, 5, 2],
    );

    assert.equal(measures[0]!.tiedToNextBar, true);
    assert.equal(measures[0]!.tiedToNext.has(2), true);
    assert.equal(measures[0]!.tiedToNext.has(3), false);
    assert.equal(measures[0]!.tiedToNext.size, 1);

    assert.equal(measures[1]!.tiedToPrevBar, true);
    assert.equal(measures[1]!.tiedToNextBar, true);

    assert.equal(measures[2]!.tiedToPrevBar, true);
    assert.equal(measures[2]!.tiedToNextBar, true);
    assert.equal(measures[2]!.tiedToNext.has(1), true);
    assert.equal(measures[2]!.tiedToNext.has(3), true);
    assert.equal(measures[2]!.tiedToNext.has(4), false);
    assert.equal(measures[2]!.tiedToNext.size, 2);

    assert.equal(measures[3]!.tiedToPrevBar, true);
    assert.equal(measures[3]!.tiedToNextBar, false);
    assert.equal(measures[3]!.tiedToNext.has(0), true);
  });

  it("rebases tuplet spans to measure-local indices", () => {
    const measures = splitIntoMeasures(
      makeGroupedMelody(METER_4_4, FOUR_FOUR_MELODY, FOUR_FOUR_TRIPLETS),
    );

    // Global starts 0 and 9; measure 3 starts at global index 9.
    assert.deepEqual(
      measures.map((measure) => measure.tuplets.length),
      [1, 0, 1, 0],
    );
    assert.deepEqual(measures[0]!.tuplets[0], {
      start: 0,
      count: 3,
      tuplet: Tuplet.Triplet,
    });
    assert.deepEqual(measures[2]!.tuplets[0], {
      start: 0,
      count: 3,
      tuplet: Tuplet.Triplet,
    });
  });

  it("throws UngroupedTupletError", () => {
    const melody = makeMelody(METER_4_4, FOUR_FOUR_MELODY); // triplets never grouped

    assert.throws(
      () => splitIntoMeasures(melody),
      (err: unknown) => {
        if (!(err instanceof UngroupedTupletError)) {
          return false;
        }
        assert.equal(err.eventIndex, 0);
        return true;
      },
    );
  });

  it("throws TupletAcrossBarlineError", () => {
    // Bar 1: 1/2 1/4 1/12 1/12 1/12   Bar 2: 1/12 1/12 1/12 3/4
    const melody = makeMelody(METER_4_4, [
      new Note(C4, HALF),
      new Note(D4, QUARTER),
      new Note(E4, EIGHTH_TRIPLET),
      new Note(F4, EIGHTH_TRIPLET),
      new Note(G4, EIGHTH_TRIPLET),
      new Note(A4, EIGHTH_TRIPLET),
      new Note(G4, EIGHTH_TRIPLET),
      new Note(F4, EIGHTH_TRIPLET),
      new Note(E4, DOTTED_HALF),
    ]);
    melody.groupTuplet(2, 6); // spans the barline after event 4

    assert.throws(
      () => splitIntoMeasures(melody),
      (err: unknown) => {
        if (!(err instanceof TupletAcrossBarlineError)) {
          return false;
        }
        assert.equal(err.spanStartIndex, 2);
        assert.equal(err.measureStartIndex, 0);
        return true;
      },
    );
  });
});
