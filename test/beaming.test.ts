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
import { splitIntoMeasures } from "../dist/music/measure.js";
import { planBeams } from "../dist/render/beaming.js";
import type { TimeSignature } from "../dist/music/types.js";

const C4 = new Pitch("C", 0, 4);

const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);
const EIGHTH = new Duration(NoteValue.Eighth);
const DOTTED_EIGHTH = new Duration(NoteValue.Eighth, 1);
const SIXTEENTH = new Duration(NoteValue.Sixteenth);
const THIRTY_SECOND = new Duration(NoteValue.ThirtySecond);
const SIXTEENTH_TRIPLET = new Duration(NoteValue.Sixteenth, 0, Tuplet.Triplet);
const EIGHTH_TRIPLET = new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);

const KEY_C_MAJOR = new KeySignature(C4, "major");
const METER_4_4: TimeSignature = { beats: 4, beatUnit: 4 };
const METER_3_4: TimeSignature = { beats: 3, beatUnit: 4 };
const METER_6_8: TimeSignature = { beats: 6, beatUnit: 8 };
const METER_3_8: TimeSignature = { beats: 3, beatUnit: 8 };

/** A note on middle C, since beaming never asks what pitch anything is. */
const note = (duration: Duration) => new Note(C4, duration);

/**
 * Plan the first measure of a melody of these events.
 *
 * `tuplets` groups events into brackets before the split, because a tuplet
 * duration that is not grouped is an error the measure builder refuses — and a
 * bracket is exactly what a secondary break is drawn against.
 */
function planFirst(
  meter: TimeSignature,
  events: readonly NoteEvent[],
  tuplets: readonly [number, number][] = [],
) {
  const melody = new Melody(KEY_C_MAJOR, meter, events);
  for (const [start, count] of tuplets) {
    melody.groupTuplet(start, count);
  }
  const measure = splitIntoMeasures(melody)[0]!;
  return planBeams(measure, meter);
}

/** Just the groups, which is what most of these are about. */
const groupsOf = (plans: ReturnType<typeof planFirst>) =>
  plans.map((plan) => plan.notes);

describe("planBeams()", () => {
  it("beams a run of eighths by the beat, so 4/4 comes out in pairs", () => {
    const plans = planFirst(METER_4_4, Array.from({ length: 8 }, () => note(EIGHTH)));
    assert.deepEqual(groupsOf(plans), [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ]);
  });

  it("holds a group open through a note that straddles the beat", () => {
    // Two dotted eighths and an eighth fill beats one and two, and the second
    // dotted eighth crosses the boundary between them. A group cannot break
    // inside a note, so it runs on to the next boundary a note actually lands
    // on — which is what makes this figure read as the syncopation it is.
    //
    // VexFlow's own generateBeams returns *no beams at all* for this bar: it
    // mis-carries its running tick total across the straddle and stays out of
    // step for the rest of the measure, which is why the two eighths at the end
    // lost their beam as well.
    const plans = planFirst(METER_4_4, [
      note(DOTTED_EIGHTH),
      note(DOTTED_EIGHTH),
      note(EIGHTH),
      note(QUARTER),
      note(EIGHTH),
      note(EIGHTH),
    ]);
    assert.deepEqual(groupsOf(plans), [
      [0, 1, 2],
      [4, 5],
    ]);
  });

  it("leaves a quarter and anything longer out of every group", () => {
    const plans = planFirst(METER_4_4, [
      note(EIGHTH),
      note(QUARTER),
      note(EIGHTH),
      note(HALF),
    ]);
    // A lone eighth either side of the quarter, and neither has a neighbour to
    // beam to.
    assert.deepEqual(groupsOf(plans), []);
  });

  it("breaks a group at a rest", () => {
    const plans = planFirst(METER_4_4, [
      note(EIGHTH),
      new Rest(EIGHTH),
      note(EIGHTH),
      note(EIGHTH),
      note(HALF),
    ]);
    assert.deepEqual(groupsOf(plans), [[2, 3]]);
  });

  it("beams a note still awaiting its pitch like any other", () => {
    // An unpitched note is a note whose pitch is not chosen yet, not a gap in
    // the rhythm — the whole play page would otherwise open unbeamed.
    const plans = planFirst(METER_4_4, [
      new UnpitchedNote(EIGHTH),
      note(EIGHTH),
      note(HALF),
      note(QUARTER),
    ]);
    assert.deepEqual(groupsOf(plans), [[0, 1]]);
  });

  it("groups a compound meter by the dotted beat, not by the eighth", () => {
    const plans = planFirst(METER_6_8, Array.from({ length: 6 }, () => note(EIGHTH)));
    assert.deepEqual(groupsOf(plans), [
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  it("beams a simple triple bar of eighths as one group", () => {
    // 3/8 is one group of three, not three groups of one: it is a bar of three
    // eighths rather than three beats that each happen to hold one.
    const plans = planFirst(METER_3_8, Array.from({ length: 3 }, () => note(EIGHTH)));
    assert.deepEqual(groupsOf(plans), [[0, 1, 2]]);
  });

  it("groups 3/4 by the quarter, where 3/8 took the whole bar", () => {
    const plans = planFirst(METER_3_4, Array.from({ length: 6 }, () => note(EIGHTH)));
    assert.deepEqual(groupsOf(plans), [
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("keeps a beat of sixteenths in one group", () => {
    const plans = planFirst(METER_4_4, [
      ...Array.from({ length: 4 }, () => note(SIXTEENTH)),
      note(HALF),
      note(QUARTER),
    ]);
    assert.deepEqual(groupsOf(plans), [[0, 1, 2, 3]]);
  });

  it("beams a tuplet in with the notes sharing its beat", () => {
    // Two sixteenths and a sixteenth triplet fill one quarter between them.
    const plans = planFirst(
      METER_4_4,
      [
        note(SIXTEENTH),
        note(SIXTEENTH),
        note(SIXTEENTH_TRIPLET),
        note(SIXTEENTH_TRIPLET),
        note(SIXTEENTH_TRIPLET),
        note(HALF),
        note(QUARTER),
      ],
      [[2, 3]],
    );
    assert.deepEqual(groupsOf(plans), [[0, 1, 2, 3, 4]]);
  });

  it("breaks the secondary beam where the subdivision changes", () => {
    // The primary beam carries straight through — the five notes are one beat
    // and read as one gesture — but the secondary beam stops at the bracket, so
    // the eye can see where the triplet begins. Drawn through, the junction
    // comes out two beams thick and says nothing about the change of division.
    //
    // The index is into the group's own notes, which is what VexFlow's
    // breakSecondaryAt takes: a break after the group's note 1.
    const plans = planFirst(
      METER_4_4,
      [
        note(SIXTEENTH),
        note(SIXTEENTH),
        note(SIXTEENTH_TRIPLET),
        note(SIXTEENTH_TRIPLET),
        note(SIXTEENTH_TRIPLET),
        note(HALF),
        note(QUARTER),
      ],
      [[2, 3]],
    );
    assert.deepEqual(plans[0]!.secondaryBreaks, [1]);
  });

  it("breaks between two brackets that meet inside one group", () => {
    // Two triplets in a row are two subdivisions, not one long one.
    const plans = planFirst(
      METER_4_4,
      [
        ...Array.from({ length: 3 }, () => note(SIXTEENTH_TRIPLET)),
        ...Array.from({ length: 3 }, () => note(SIXTEENTH_TRIPLET)),
        note(HALF),
        note(QUARTER),
      ],
      [
        [0, 3],
        [3, 3],
      ],
    );
    assert.deepEqual(groupsOf(plans), [[0, 1, 2, 3, 4, 5]]);
    assert.deepEqual(plans[0]!.secondaryBreaks, [2]);
  });

  it("asks for no break where the division never changes", () => {
    const plans = planFirst(METER_4_4, [
      ...Array.from({ length: 4 }, () => note(SIXTEENTH)),
      note(HALF),
      note(QUARTER),
    ]);
    assert.deepEqual(plans[0]!.secondaryBreaks, []);
  });

  it("beams an eighth triplet filling its own beat", () => {
    const plans = planFirst(
      METER_4_4,
      [
        ...Array.from({ length: 3 }, () => note(EIGHTH_TRIPLET)),
        note(HALF),
        note(QUARTER),
      ],
      [[0, 3]],
    );
    assert.deepEqual(groupsOf(plans), [[0, 1, 2]]);
    assert.deepEqual(plans[0]!.secondaryBreaks, []);
  });

  it("beams thirty-seconds, down to the shortest value that is written", () => {
    const plans = planFirst(METER_4_4, [
      ...Array.from({ length: 8 }, () => note(THIRTY_SECOND)),
      note(HALF),
      note(QUARTER),
    ]);
    assert.deepEqual(groupsOf(plans), [[0, 1, 2, 3, 4, 5, 6, 7]]);
  });

  it("plans each measure of a melody on its own", () => {
    const melody = new Melody(KEY_C_MAJOR, METER_4_4, [
      ...Array.from({ length: 8 }, () => note(EIGHTH)),
      note(HALF),
      note(HALF),
    ]);
    const measures = splitIntoMeasures(melody);
    // Indices are measure-local, so the second bar counts from zero again —
    // accidentals do not cross a barline and neither does a beam.
    assert.deepEqual(groupsOf(planBeams(measures[0]!, METER_4_4)), [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ]);
    assert.deepEqual(groupsOf(planBeams(measures[1]!, METER_4_4)), []);
  });
});
