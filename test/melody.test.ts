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

const C4 = new Pitch("C", 0, 4);
const D4 = new Pitch("D", 0, 4);
const E4 = new Pitch("E", 0, 4);
const F4 = new Pitch("F", 0, 4);
const F_SHARP_4 = new Pitch("F", 1, 4);
const G4 = new Pitch("G", 0, 4);
const G_FLAT_4 = new Pitch("G", -1, 4);
const B_FLAT_4 = new Pitch("B", -1, 4);

const QUARTER = new Duration(NoteValue.Quarter);
const DOTTED_QUARTER = new Duration(NoteValue.Quarter, 1);
const HALF = new Duration(NoteValue.Half);
const EIGHTH = new Duration(NoteValue.Eighth);
const SIXTEENTH = new Duration(NoteValue.Sixteenth);

const KEY_C_MAJOR = new KeySignature(new Pitch("C", 0, 4), "major");
const KEY_A_MINOR = new KeySignature(new Pitch("A", 0, 4), "minor");
const KEY_CBB_MINOR = new KeySignature(new Pitch("C", -2, 4), "minor");
const KEY_B_FLAT_MINOR = new KeySignature(new Pitch("B", -1, 4), "minor");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;
const METER_2_2 = { beats: 2, beatUnit: 2 } as const;

function makeDefaultMelody(events: readonly NoteEvent[]): Melody {
  return new Melody(KEY_C_MAJOR, METER_4_4, events);
}

describe("Melody", () => {
  it("constructor: copies events without aliasing the input array", () => {
    const events = [new Note(C4, QUARTER), new Rest(HALF)];
    const melody = makeDefaultMelody(events);

    events.push(new Note(D4, QUARTER));
    melody.setPitch(0, D4);

    assert.equal(melody.eventCount, 2);
    assert.equal(events.length, 3);
    assert.equal((melody.getEvent(0) as Note).pitch.isEqual(D4), true);
  });

  it("getEvent()", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Rest(QUARTER),
      new Note(D4, QUARTER),
    ]);

    assert.equal(melody.getEvent(0) instanceof Note, true);
    assert.equal(melody.getEvent(1) instanceof Rest, true);
  });

  it("getEvent(): throws RangeError for out-of-range indices", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Rest(QUARTER),
      new Note(D4, QUARTER),
    ]);

    assert.throws(
      () => melody.getEvent(-1),
      (err: unknown) => err instanceof RangeError,
    );
    assert.throws(
      () => melody.getEvent(3),
      (err: unknown) => err instanceof RangeError,
    );
  });

  it("setDuration()", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Rest(QUARTER),
    ]);

    melody.setDuration(0, HALF);
    melody.setDuration(1, HALF);

    assert.equal(melody.getEvent(0).duration.isEqual(HALF), true);
    assert.equal(melody.getEvent(1).duration.isEqual(HALF), true);
    assert.equal((melody.getEvent(0) as Note).pitch.isEqual(C4), true);
  });

  it("isEqual()", () => {
    const baselineEvents = [
      new Note(C4, QUARTER),
      new Rest(HALF),
      new Note(D4, QUARTER),
    ];
    const baseline = new Melody(KEY_C_MAJOR, METER_4_4, baselineEvents);
    const identical = new Melody(KEY_C_MAJOR, METER_4_4, baselineEvents);
    const differentKey = new Melody(KEY_A_MINOR, METER_4_4, baselineEvents);
    const differentMeter = new Melody(KEY_C_MAJOR, METER_2_2, baselineEvents);
    const differentPitch = new Melody(KEY_C_MAJOR, METER_4_4, [
      new Note(E4, QUARTER),
      new Rest(HALF),
      new Note(D4, QUARTER),
    ]);
    const differentDuration = new Melody(KEY_C_MAJOR, METER_4_4, [
      new Note(C4, QUARTER),
      new Rest(HALF),
      new Note(D4, EIGHTH),
    ]);
    const noteBecomesRest = new Melody(KEY_C_MAJOR, METER_4_4, [
      new Note(C4, QUARTER),
      new Rest(HALF),
      new Rest(QUARTER),
    ]);
    const extraNote = new Melody(KEY_C_MAJOR, METER_4_4, [
      new Note(C4, QUARTER),
      new Rest(HALF),
      new Note(D4, QUARTER),
      new Note(E4, QUARTER),
    ]);

    assert.equal(baseline.isEqual(identical), true);
    assert.equal(baseline.isEqual(differentKey), false);
    assert.equal(baseline.isEqual(differentMeter), false);
    assert.equal(baseline.isEqual(differentPitch), false);
    assert.equal(baseline.isEqual(differentDuration), false);
    assert.equal(baseline.isEqual(noteBecomesRest), false);
    assert.equal(baseline.isEqual(extraNote), false);
  });

  it("isEnharmonicallyEqual()", () => {
    const baselineEvents = [
      new Note(F_SHARP_4, QUARTER),
      new Rest(HALF),
      new Note(C4, QUARTER),
    ];
    const baseline = new Melody(KEY_CBB_MINOR, METER_4_4, baselineEvents);
    const identical = new Melody(KEY_CBB_MINOR, METER_4_4, baselineEvents);
    const differentOctave = new Melody(
      new KeySignature(new Pitch("C", -2, 3), "minor"),
      METER_4_4,
      baselineEvents,
    );
    const differentMode = new Melody(
      new KeySignature(new Pitch("C", -2, 4), "major"),
      METER_4_4,
      baselineEvents,
    );
    const enharmonicKey = new Melody(KEY_B_FLAT_MINOR, METER_4_4, baselineEvents);
    const enharmonicEventSpelling = new Melody(KEY_CBB_MINOR, METER_4_4, [
      new Note(G_FLAT_4, QUARTER),
      new Rest(HALF),
      new Note(C4, QUARTER),
    ]);
    const differentDuration = new Melody(KEY_CBB_MINOR, METER_4_4, [
      new Note(F_SHARP_4, QUARTER),
      new Rest(QUARTER),
      new Note(C4, QUARTER),
    ]);

    assert.equal(baseline.isEnharmonicallyEqual(identical), true);
    assert.equal(baseline.isEnharmonicallyEqual(differentOctave), true);
    assert.equal(baseline.isEnharmonicallyEqual(enharmonicKey), true);
    assert.equal(baseline.isEnharmonicallyEqual(enharmonicEventSpelling), true);
    assert.equal(baseline.isEnharmonicallyEqual(differentMode), false);
    assert.equal(baseline.isEnharmonicallyEqual(differentDuration), false);
  });

  it("playback()", () => {
    const melody = makeDefaultMelody([
      new Note(F_SHARP_4, EIGHTH),
      new Rest(EIGHTH),
      new Note(G4, DOTTED_QUARTER),
      new Note(B_FLAT_4, SIXTEENTH),
    ]);

    const wav = melody.playback(88);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const pcm = (sampleIndex: number) =>
      view.getInt16(44 + sampleIndex * 2, true);

    assert.equal(wav.length, 165420);
    assert.equal(view.getUint32(24, true), 44100);
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(40, true), 165376);
    assert.equal(
      String.fromCharCode(wav[0]!, wav[1]!, wav[2]!, wav[3]!),
      "RIFF",
    );
    assert.equal(
      String.fromCharCode(wav[8]!, wav[9]!, wav[10]!, wav[11]!),
      "WAVE",
    );

    assert.equal(pcm(2255), -4778);
    assert.equal(pcm(22551), 0);
    assert.equal(pcm(39089), 9039);
    assert.equal(pcm(77426), -8050);
  });

  it("playback(): throws RangeError on nonpositive bpm", () => {
    const melody = makeDefaultMelody([new Note(C4, QUARTER)]);

    assert.throws(
      () => melody.playback(0),
      (err: unknown) =>
        err instanceof RangeError && err.message === "bpm must be positive",
    );
    assert.throws(
      () => melody.playback(-1),
      (err: unknown) => err instanceof RangeError,
    );
  });

  it("playback(): produces silence for a rest-only melody", () => {
    const wav = makeDefaultMelody([new Rest(QUARTER)]).playback(88);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    assert.equal(wav.length, 60182);
    assert.equal(view.getInt16(44, true), 0);
    assert.equal(view.getInt16(44 + 10_000 * 2, true), 0);
  });

  it("toString()", () => {
    const melody = makeDefaultMelody([
      new Note(E4, QUARTER),
      new Note(F4, QUARTER),
      new Rest(HALF),
    ]);

    assert.equal(melody.toString(), "e4/q, f4/q, b4/h/r");
  });
});

describe("Melody Ties", () => {
  it("tie()", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ]);

    melody.tie(0);

    assert.equal(melody.isTiedToNext(0), true);
    assert.equal(melody.isTiedToPrev(1), true);
    assert.deepEqual(melody.getTiedGroup(0), [0, 1]);
    assert.deepEqual(melody.getTiedGroup(1), [0, 1]);
  });

  it("tie(): throws RangeError when index + 1 is out of bounds", () => {
    const melody = makeDefaultMelody([new Note(C4, QUARTER)]);

    assert.throws(
      () => melody.tie(0),
      (err: unknown) => err instanceof RangeError,
    );
    assert.throws(
      () => melody.tie(-1),
      (err: unknown) => err instanceof RangeError,
    );
    assert.equal(melody.isTiedToNext(0), false);
  });

  it("tie(): throws TypeError when either event is a Rest", () => {
    const noteThenRest = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Rest(QUARTER),
    ]);
    assert.throws(
      () => noteThenRest.tie(0),
      (err: unknown) =>
        err instanceof TypeError &&
        err.message === "Cannot tie a note to a rest",
    );
    assert.equal(noteThenRest.isTiedToNext(0), false);

    const restThenNote = makeDefaultMelody([
      new Rest(QUARTER),
      new Note(C4, QUARTER),
    ]);
    assert.throws(
      () => restThenNote.tie(0),
      (err: unknown) =>
        err instanceof TypeError &&
        err.message === "Cannot tie a rest to another event",
    );
    assert.equal(restThenNote.isTiedToNext(0), false);
  });

  it("tie(): throws TypeError when pitches differ, including enharmonic spellings", () => {
    const differentPitch = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(D4, QUARTER),
    ]);
    assert.throws(
      () => differentPitch.tie(0),
      (err: unknown) =>
        err instanceof TypeError &&
        err.message ===
          "Cannot tie notes with different pitches: pitches must match exactly",
    );
    assert.equal(differentPitch.isTiedToNext(0), false);

    const enharmonic = makeDefaultMelody([
      new Note(F_SHARP_4, QUARTER),
      new Note(G_FLAT_4, QUARTER),
    ]);
    assert.throws(
      () => enharmonic.tie(0),
      (err: unknown) =>
        err instanceof TypeError &&
        err.message ===
          "Cannot tie notes with different pitches: pitches must match exactly",
    );
    assert.equal(enharmonic.isTiedToNext(0), false);
  });

  it("untie()", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ]);
    melody.tie(0);

    melody.untie(0);

    assert.equal(melody.isTiedToNext(0), false);
    assert.equal(melody.isTiedToPrev(1), false);
    assert.deepEqual(melody.getTiedGroup(0), [0]);
    assert.deepEqual(melody.getTiedGroup(1), [1]);
  });

  it("untie(): is a no-op when no tie exists", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ]);

    assert.doesNotThrow(() => melody.untie(0));
    assert.equal(melody.isTiedToNext(0), false);
  });

  it("getTiedGroup(): returns [index] alone for an untied note", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(D4, QUARTER),
      new Note(C4, QUARTER),
    ]);

    assert.deepEqual(melody.getTiedGroup(1), [1]);
  });

  it("getTiedGroup(): returns the full chain from every index in a 3+ note group", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, HALF),
      new Note(D4, QUARTER),
    ]);
    melody.tie(0);
    melody.tie(1);

    assert.deepEqual(melody.getTiedGroup(0), [0, 1, 2]);
    assert.deepEqual(melody.getTiedGroup(1), [0, 1, 2]);
    assert.deepEqual(melody.getTiedGroup(2), [0, 1, 2]);
    assert.deepEqual(melody.getTiedGroup(3), [3]);
  });

  it("setPitch(): updates every note in a tied group while preserving durations", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, HALF),
    ]);
    melody.tie(0);
    melody.tie(1);

    melody.setPitch(1, D4);

    const note0 = melody.getEvent(0);
    const note1 = melody.getEvent(1);
    const note2 = melody.getEvent(2);
    assert(note0 instanceof Note);
    assert(note1 instanceof Note);
    assert(note2 instanceof Note);

    assert.equal(note0.pitch.isEqual(D4), true);
    assert.equal(note1.pitch.isEqual(D4), true);
    assert.equal(note2.pitch.isEqual(D4), true);
    assert.equal(note0.duration.isEqual(QUARTER), true);
    assert.equal(note1.duration.isEqual(QUARTER), true);
    assert.equal(note2.duration.isEqual(HALF), true);
  });

  it("setPitch(): updates individual untied notes independently", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(E4, QUARTER),
      new Note(G4, QUARTER),
    ]);

    melody.setPitch(0, D4);
    melody.setPitch(1, F_SHARP_4);
    melody.setPitch(2, G_FLAT_4);

    assert.equal((melody.getEvent(0) as Note).pitch.isEqual(D4), true);
    assert.equal((melody.getEvent(1) as Note).pitch.isEqual(F_SHARP_4), true);
    assert.equal((melody.getEvent(2) as Note).pitch.isEqual(G_FLAT_4), true);
  });

  it("setPitch(): throws TypeError when called on a Rest", () => {
    const melody = makeDefaultMelody([new Rest(QUARTER)]);

    assert.throws(
      () => melody.setPitch(0, D4),
      (err: unknown) =>
        err instanceof TypeError &&
        err.message === "Cannot set pitch on a rest",
    );
  });

  it("isEqual(): returns false on differing tie structures", () => {
    const tiedPair = [
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ] as const;

    const untied = makeDefaultMelody(tiedPair);
    const tied = makeDefaultMelody(tiedPair);
    tied.tie(0);
    const singleHalf = makeDefaultMelody([new Note(C4, HALF)]);

    assert.equal(untied.isEqual(tied), false);
    assert.equal(untied.isEqual(singleHalf), false);
    assert.equal(tied.isEqual(singleHalf), false);
    assert.equal(untied.isEnharmonicallyEqual(tied), false);
  });
});

const EIGHTH_TRIPLET = new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);
const QUARTER_TRIPLET = new Duration(NoteValue.Quarter, 0, Tuplet.Triplet);

/** Six eighth-note triplets: two groupable runs of three. */
function makeTripletMelody(): Melody {
  return makeDefaultMelody([
    new Note(C4, EIGHTH_TRIPLET),
    new Note(D4, EIGHTH_TRIPLET),
    new Note(E4, EIGHTH_TRIPLET),
    new Note(F4, EIGHTH_TRIPLET),
    new Note(G4, EIGHTH_TRIPLET),
    new Note(C4, EIGHTH_TRIPLET),
  ]);
}

describe("Melody Tuplets", () => {
  it("groupTuplet()", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(0, 3);
    melody.groupTuplet(3, 3);

    assert.deepEqual(melody.tupletSpans(), [
      { start: 0, count: 3, tuplet: Tuplet.Triplet },
      { start: 3, count: 3, tuplet: Tuplet.Triplet },
    ]);
  });

  it("groupTuplet(): does not modify the events", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(0, 3);

    for (let i = 0; i < melody.eventCount; i++) {
      assert.equal(melody.getEvent(i).duration.isEqual(EIGHTH_TRIPLET), true);
    }
  });

  it("groupTuplet(): throws RangeError when count is below 2 or noninteger", () => {
    const melody = makeTripletMelody();

    for (const count of [1, 2.5]) {
      assert.throws(
        () => melody.groupTuplet(0, count),
        (err: unknown) =>
          err instanceof RangeError &&
          err.message === "count must be an integer greater than 1",
      );
    }
  });

  it("groupTuplet(): throws RangeError when the span runs past the end", () => {
    const melody = makeTripletMelody();

    assert.throws(
      () => melody.groupTuplet(4, 3),
      (err: unknown) =>
        err instanceof RangeError &&
        err.message ===
          "Cannot group 3 events into a tuplet at index 4: the melody has 6 events",
    );
  });

  it("groupTuplet(): throws TypeError when the first event has no tuplet", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(D4, EIGHTH_TRIPLET),
      new Note(E4, EIGHTH_TRIPLET),
    ]);

    assert.throws(
      () => melody.groupTuplet(0, 3),
      (err: unknown) =>
        err instanceof TypeError &&
        err.message ===
          "Cannot group a tuplet at index 0: the event has no tuplet duration",
    );
  });

  it("groupTuplet(): throws TypeError on mismatched ratios", () => {
    const melody = makeDefaultMelody([
      new Note(C4, EIGHTH_TRIPLET),
      new Note(D4, EIGHTH_TRIPLET),
      new Note(E4, new Duration(NoteValue.Eighth, 0, Tuplet.Quintuplet)),
    ]);

    assert.throws(
      () => melody.groupTuplet(0, 3),
      (err: unknown) =>
        err instanceof TypeError &&
        err.message ===
          "Cannot group a tuplet at index 0: event 2 does not have the same tuplet ratio",
    );
  });

  it("groupTuplet(): throws RangeError when the group is incomplete", () => {
    const melody = makeTripletMelody();

    assert.throws(
      () => melody.groupTuplet(0, 2), // two thirds of a triplet
      (err: unknown) =>
        err instanceof RangeError &&
        err.message ===
          "Cannot group a tuplet at index 0: the 3:2 group is incomplete, sounding 1/6 of a whole note",
    );
  });

  it("groupTuplet(): accepts a complete group of mixed durations", () => {
    // A triplet written as quarter + eighth still fills three eighth units.
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER_TRIPLET),
      new Note(D4, EIGHTH_TRIPLET),
    ]);
    melody.groupTuplet(0, 2);

    assert.deepEqual(melody.tupletSpans(), [
      { start: 0, count: 2, tuplet: Tuplet.Triplet },
    ]);
  });

  it("groupTuplet(): throws RangeError on overlapping spans", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(0, 3);

    assert.throws(
      () => melody.groupTuplet(2, 3),
      (err: unknown) =>
        err instanceof RangeError &&
        err.message ===
          "Cannot group a tuplet at index 2: event 2 is already in a tuplet",
    );
  });

  it("ungroupTuplet()", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(0, 3);
    melody.groupTuplet(3, 3);
    melody.ungroupTuplet(0);

    assert.deepEqual(melody.tupletSpans(), [
      { start: 3, count: 3, tuplet: Tuplet.Triplet },
    ]);
  });

  it("ungroupTuplet(): no-op when no span starts there", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(0, 3);
    melody.ungroupTuplet(1);

    assert.equal(melody.tupletSpans().length, 1);
  });

  it("getTupletSpan()", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(0, 3);

    for (const index of [0, 1, 2]) {
      assert.deepEqual(melody.getTupletSpan(index), {
        start: 0,
        count: 3,
        tuplet: Tuplet.Triplet,
      });
    }
  });

  it("getTupletSpan(): lone span of Tuplet.None when ungrouped", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(0, 3);

    assert.deepEqual(melody.getTupletSpan(4), {
      start: 4,
      count: 1,
      tuplet: Tuplet.None,
    });
  });

  it("getTupletSpan(): throws RangeError when out of range", () => {
    const melody = makeTripletMelody();

    assert.throws(
      () => melody.getTupletSpan(6),
      (err: unknown) =>
        err instanceof RangeError && err.message === "No event at index 6",
    );
  });

  it("tupletSpans(): ordered by start index", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(3, 3);
    melody.groupTuplet(0, 3);

    assert.deepEqual(
      melody.tupletSpans().map((span) => span.start),
      [0, 3],
    );
  });

  it("setDuration(): allowed inside a span when the ratio matches", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(0, 3);
    melody.setDuration(1, QUARTER_TRIPLET);

    assert.equal(melody.getEvent(1).duration.isEqual(QUARTER_TRIPLET), true);
  });

  it("setDuration(): throws TypeError when it would break a span", () => {
    const melody = makeTripletMelody();
    melody.groupTuplet(0, 3);

    assert.throws(
      () => melody.setDuration(1, QUARTER),
      (err: unknown) =>
        err instanceof TypeError &&
        err.message ===
          "Cannot set duration at index 1: the event is grouped in a 3:2 tuplet",
    );
  });

  it("isEqual(): returns false on differing tuplet grouping", () => {
    const ungrouped = makeTripletMelody();
    const grouped = makeTripletMelody();
    grouped.groupTuplet(0, 3);
    grouped.groupTuplet(3, 3);
    const groupedAsSix = makeTripletMelody();
    groupedAsSix.groupTuplet(0, 6);

    assert.equal(ungrouped.isEqual(grouped), false);
    assert.equal(grouped.isEqual(groupedAsSix), false);
    assert.equal(ungrouped.isEnharmonicallyEqual(grouped), false);
  });

  it("toString(): shows the tuplet ratio on each event", () => {
    const melody = makeDefaultMelody([
      new Note(C4, EIGHTH_TRIPLET),
      new Note(D4, EIGHTH_TRIPLET),
      new Rest(EIGHTH_TRIPLET),
    ]);
    melody.groupTuplet(0, 3);

    assert.equal(melody.toString(), "c4/8{3:2}, d4/8{3:2}, b4/8{3:2}/r");
  });
});

describe("Melody Unpitched Notes", () => {
  it("setPitch(): turns a note awaiting a pitch into a pitched one", () => {
    const melody = makeDefaultMelody([
      new UnpitchedNote(QUARTER),
      new Rest(QUARTER),
    ]);

    melody.setPitch(0, C4);

    assert.equal(melody.getEvent(0).isEqual(new Note(C4, QUARTER)), true);
    // The rhythm is what was already decided, so it survives untouched.
    assert.equal(melody.getEvent(1).isEqual(new Rest(QUARTER)), true);
  });

  it("setPitch(): pitches a whole tied group of unpitched notes at once", () => {
    const melody = makeDefaultMelody([
      new UnpitchedNote(QUARTER),
      new UnpitchedNote(HALF),
      new UnpitchedNote(QUARTER),
    ]);
    melody.tie(0);
    melody.tie(1);

    melody.setPitch(1, D4);

    assert.equal(melody.getEvent(0).isEqual(new Note(D4, QUARTER)), true);
    assert.equal(melody.getEvent(1).isEqual(new Note(D4, HALF)), true);
    assert.equal(melody.getEvent(2).isEqual(new Note(D4, QUARTER)), true);
  });

  it("clearPitch(): returns a pitched note to awaiting a pitch", () => {
    const melody = makeDefaultMelody([new Note(C4, DOTTED_QUARTER)]);

    melody.clearPitch(0);

    assert.equal(
      melody.getEvent(0).isEqual(new UnpitchedNote(DOTTED_QUARTER)),
      true,
    );
  });

  it("clearPitch(): clears a whole tied group, which must share one pitch", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ]);
    melody.tie(0);

    melody.clearPitch(1);

    assert.equal(melody.getEvent(0).isEqual(new UnpitchedNote(QUARTER)), true);
    assert.equal(melody.getEvent(1).isEqual(new UnpitchedNote(QUARTER)), true);
    // Clearing is not untying: the group is still one sound, still unpitched.
    assert.equal(melody.isTiedToNext(0), true);
  });

  it("clearPitch(): is a no-op on a note already awaiting a pitch", () => {
    const melody = makeDefaultMelody([new UnpitchedNote(HALF)]);

    melody.clearPitch(0);

    assert.equal(melody.getEvent(0).isEqual(new UnpitchedNote(HALF)), true);
  });

  it("clearPitch(): throws TypeError when called on a Rest", () => {
    const melody = makeDefaultMelody([new Rest(QUARTER)]);

    assert.throws(() => melody.clearPitch(0), TypeError);
  });

  it("clearPitch(): throws RangeError for an out-of-range index", () => {
    const melody = makeDefaultMelody([new Note(C4, QUARTER)]);

    assert.throws(() => melody.clearPitch(1), RangeError);
  });

  it("setPitch() and clearPitch() round-trip, preserving the rhythm", () => {
    const melody = makeDefaultMelody([new UnpitchedNote(DOTTED_QUARTER)]);

    melody.setPitch(0, F_SHARP_4);
    melody.clearPitch(0);

    assert.equal(
      melody.getEvent(0).isEqual(new UnpitchedNote(DOTTED_QUARTER)),
      true,
    );
  });

  it("setDuration(): leaves a note still awaiting a pitch", () => {
    const melody = makeDefaultMelody([new UnpitchedNote(QUARTER)]);

    melody.setDuration(0, HALF);

    assert.equal(melody.getEvent(0).isEqual(new UnpitchedNote(HALF)), true);
  });

  it("tie(): joins two notes that are both awaiting a pitch", () => {
    const melody = makeDefaultMelody([
      new UnpitchedNote(QUARTER),
      new UnpitchedNote(QUARTER),
    ]);

    melody.tie(0);

    assert.equal(melody.isTiedToNext(0), true);
    assert.deepEqual(melody.getTiedGroup(0), [0, 1]);
  });

  it("tie(): throws TypeError when only one end has a pitch", () => {
    // The two cannot be asserted to be one sound while they disagree on what
    // that sound is; the editor gives the second the first's pitch beforehand.
    const pitchedFirst = makeDefaultMelody([
      new Note(C4, QUARTER),
      new UnpitchedNote(QUARTER),
    ]);
    const pitchedSecond = makeDefaultMelody([
      new UnpitchedNote(QUARTER),
      new Note(C4, QUARTER),
    ]);

    assert.throws(() => pitchedFirst.tie(0), TypeError);
    assert.throws(() => pitchedSecond.tie(0), TypeError);
  });

  it("tie(): still throws TypeError against a Rest", () => {
    const melody = makeDefaultMelody([
      new UnpitchedNote(QUARTER),
      new Rest(QUARTER),
    ]);

    assert.throws(() => melody.tie(0), TypeError);
  });

  it("playback(): sounds a note awaiting a pitch as silence", () => {
    const unpitched = makeDefaultMelody([new UnpitchedNote(QUARTER)]).playback(
      88,
    );
    const rest = makeDefaultMelody([new Rest(QUARTER)]).playback(88);

    // Nothing has been decided to sound yet, so nothing sounds.
    assert.deepEqual(unpitched, rest);
  });

  it("isFullyPitched()", () => {
    assert.equal(makeDefaultMelody([]).isFullyPitched(), true);
    assert.equal(
      makeDefaultMelody([new Note(C4, QUARTER), new Rest(QUARTER)]).isFullyPitched(),
      true,
    );
    assert.equal(
      makeDefaultMelody([
        new Note(C4, QUARTER),
        new UnpitchedNote(QUARTER),
      ]).isFullyPitched(),
      false,
    );
  });

  it("isFullyPitched(): becomes true once the last pitch is set", () => {
    const melody = makeDefaultMelody([new UnpitchedNote(QUARTER)]);

    assert.equal(melody.isFullyPitched(), false);
    melody.setPitch(0, G4);
    assert.equal(melody.isFullyPitched(), true);
  });

  it("toString()", () => {
    const melody = makeDefaultMelody([
      new UnpitchedNote(QUARTER),
      new Note(C4, QUARTER),
      new Rest(HALF),
    ]);

    assert.equal(melody.toString(), "x/q, c4/q, b4/h/r");
  });
});

describe("Melody setEvent", () => {
  it("replaces one event without disturbing anything around it", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(D4, QUARTER),
    ]);

    melody.setEvent(1, new Rest(QUARTER));

    assert.equal(melody.eventCount, 2);
    assert.equal(melody.toString(), "c4/q, b4/q/r");
  });

  it("keeps a tuplet bracket the event belongs to", () => {
    const melody = makeDefaultMelody([
      new Note(C4, EIGHTH_TRIPLET),
      new Note(D4, EIGHTH_TRIPLET),
      new Note(E4, EIGHTH_TRIPLET),
    ]);
    melody.groupTuplet(0, 3);

    melody.setEvent(1, new Rest(EIGHTH_TRIPLET));

    // Replacing a member in place is not restructuring, so the bracket stands.
    assert.deepEqual(
      melody.tupletSpans().map(({ start, count }) => ({ start, count })),
      [{ start: 0, count: 3 }],
    );
  });

  it("keeps ties the new event can still honour", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ]);
    melody.tie(0);

    melody.setEvent(1, new Note(C4, HALF));

    assert.equal(melody.isTiedToNext(0), true);
  });

  it("drops ties the new event cannot honour", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ]);
    melody.tie(0);
    melody.tie(1);

    // Silence cannot be tied, so both ties into and out of it must go.
    melody.setEvent(1, new Rest(QUARTER));

    assert.equal(melody.isTiedToNext(0), false);
    assert.equal(melody.isTiedToNext(1), false);
  });

  it("drops a tie to a note that now disagrees on pitch", () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ]);
    melody.tie(0);

    melody.setEvent(1, new Note(D4, QUARTER));

    assert.equal(melody.isTiedToNext(0), false);
  });

  it("throws RangeError for an index outside the melody", () => {
    const melody = makeDefaultMelody([new Note(C4, QUARTER)]);

    assert.throws(() => melody.setEvent(1, new Rest(QUARTER)), RangeError);
  });
});

describe("Melody replaceEvents", () => {
  const five = () =>
    makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(D4, QUARTER),
      new Note(E4, QUARTER),
      new Note(F4, QUARTER),
      new Note(G4, QUARTER),
    ]);

  it("replaces a range with different events", () => {
    const melody = five();

    melody.replaceEvents(1, 2, [new Rest(HALF)]);

    assert.equal(melody.eventCount, 4);
    assert.equal(melody.toString(), "c4/q, b4/h/r, f4/q, g4/q");
  });

  it("inserts without deleting", () => {
    const melody = five();

    melody.replaceEvents(2, 0, [new Rest(EIGHTH)]);

    assert.equal(melody.eventCount, 6);
    assert.equal(melody.getEvent(2).isEqual(new Rest(EIGHTH)), true);
    assert.equal(melody.getEvent(3).isEqual(new Note(E4, QUARTER)), true);
  });

  it("deletes without inserting", () => {
    const melody = five();

    melody.replaceEvents(0, 2, []);

    assert.equal(melody.eventCount, 3);
    assert.equal(melody.getEvent(0).isEqual(new Note(E4, QUARTER)), true);
  });

  it("throws RangeError when the range falls outside the melody", () => {
    assert.throws(() => five().replaceEvents(-1, 1, []), RangeError);
    assert.throws(() => five().replaceEvents(4, 2, []), RangeError);
    assert.throws(() => five().replaceEvents(6, 0, []), RangeError);
    assert.throws(() => five().replaceEvents(0, -1, []), RangeError);
  });

  /** Ties need matching pitches, and these tests turn only on position. */
  const fiveTiable = () =>
    makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
    ]);

  it("leaves ties before the splice alone and shifts those after it", () => {
    const melody = fiveTiable();
    melody.tie(0); // 0–1, entirely before
    melody.tie(3); // 3–4, entirely after

    melody.replaceEvents(2, 1, [new Rest(EIGHTH), new Rest(EIGHTH)]);

    assert.equal(melody.isTiedToNext(0), true);
    // The pair at 3–4 has one extra event before it now.
    assert.equal(melody.isTiedToNext(4), true);
    assert.equal(melody.isTiedToNext(3), false);
  });

  it("drops a tie that reached into the replaced range", () => {
    const melody = fiveTiable();
    melody.tie(1); // 1–2, and 2 is about to be replaced

    melody.replaceEvents(2, 1, [new Rest(QUARTER)]);

    assert.equal(melody.isTiedToNext(1), false);
  });

  it("drops a tie the insertion would come between", () => {
    const melody = fiveTiable();
    melody.tie(1);

    melody.replaceEvents(2, 0, [new Rest(QUARTER)]);

    // The two are no longer neighbours, so they can no longer be one sound.
    assert.equal(melody.isTiedToNext(1), false);
    assert.equal(melody.isTiedToNext(2), false);
  });

  it("changes nothing at all for an empty splice", () => {
    const melody = fiveTiable();
    melody.tie(1);

    melody.replaceEvents(2, 0, []);

    assert.equal(melody.eventCount, 5);
    assert.equal(melody.isTiedToNext(1), true);
  });

  const withTriplet = () => {
    const melody = makeDefaultMelody([
      new Note(C4, QUARTER),
      new Note(D4, EIGHTH_TRIPLET),
      new Note(E4, EIGHTH_TRIPLET),
      new Note(F4, EIGHTH_TRIPLET),
      new Note(G4, QUARTER),
    ]);
    melody.groupTuplet(1, 3);
    return melody;
  };

  it("shifts a tuplet group that lies after the splice", () => {
    const melody = withTriplet();

    melody.replaceEvents(0, 1, [new Rest(EIGHTH), new Rest(EIGHTH)]);

    assert.deepEqual(
      melody.tupletSpans().map(({ start, count }) => ({ start, count })),
      [{ start: 2, count: 3 }],
    );
  });

  it("leaves a tuplet group that lies before the splice", () => {
    const melody = withTriplet();

    melody.replaceEvents(4, 1, [new Rest(EIGHTH)]);

    assert.deepEqual(
      melody.tupletSpans().map(({ start, count }) => ({ start, count })),
      [{ start: 1, count: 3 }],
    );
  });

  it("drops a tuplet group the splice overlaps", () => {
    const melody = withTriplet();

    melody.replaceEvents(2, 1, [new Rest(EIGHTH)]);

    assert.deepEqual(melody.tupletSpans(), []);
  });

  it("drops a tuplet group an insertion lands inside", () => {
    const melody = withTriplet();

    melody.replaceEvents(2, 0, [new Rest(EIGHTH)]);

    // A bracket has to cover consecutive events, so it cannot survive a gap.
    assert.deepEqual(melody.tupletSpans(), []);
  });

  it("keeps a tuplet group when an insertion abuts either end", () => {
    const before = withTriplet();
    before.replaceEvents(1, 0, [new Rest(EIGHTH)]);
    assert.deepEqual(
      before.tupletSpans().map(({ start, count }) => ({ start, count })),
      [{ start: 2, count: 3 }],
    );

    const after = withTriplet();
    after.replaceEvents(4, 0, [new Rest(EIGHTH)]);
    assert.deepEqual(
      after.tupletSpans().map(({ start, count }) => ({ start, count })),
      [{ start: 1, count: 3 }],
    );
  });
});
