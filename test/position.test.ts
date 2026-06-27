import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { Fraction } from "../dist/music/fraction.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent, Rest } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import {
  barLengthOf,
  eventPositions,
  indexAtStart,
  indexCovering,
  measureCountOf,
  totalLengthOf,
} from "../dist/editor/position.js";

const C4 = new Pitch("C", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);
const EIGHTH = new Duration(NoteValue.Eighth);

const KEY = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;
const METER_3_4 = { beats: 3, beatUnit: 4 } as const;
const METER_6_8 = { beats: 6, beatUnit: 8 } as const;

const f = (num: number, den: number) => new Fraction(num, den);
const note = () => new Note(C4, QUARTER);

const melodyOf = (
  events: readonly NoteEvent[],
  meter: typeof METER_4_4 | typeof METER_3_4 | typeof METER_6_8 = METER_4_4,
) => new Melody(KEY, meter, events);

describe("barLengthOf()", () => {
  it("is the bar's share of a whole note", () => {
    assert.equal(barLengthOf(METER_4_4).toString(), "1/1");
    assert.equal(barLengthOf(METER_3_4).toString(), "3/4");
    assert.equal(barLengthOf(METER_6_8).toString(), "3/4");
  });
});

const WHOLE_REST = new Rest(new Duration(NoteValue.Whole));

describe("measureCountOf()", () => {
  it("is nothing for a melody with no events", () => {
    assert.equal(measureCountOf(melodyOf([])), 0);
  });

  it("counts the bars the events fill", () => {
    assert.equal(measureCountOf(melodyOf([WHOLE_REST])), 1);
    assert.equal(measureCountOf(melodyOf([WHOLE_REST, WHOLE_REST])), 2);
  });

  it("counts a bar that is only partly written", () => {
    assert.equal(measureCountOf(melodyOf([note()])), 1);
    assert.equal(measureCountOf(melodyOf([WHOLE_REST, note()])), 2);
  });

  it("counts bars of the meter it is in, not whole notes", () => {
    // Three quarters to the bar, so six of them are two bars.
    const events = Array.from({ length: 6 }, note);
    assert.equal(measureCountOf(melodyOf(events, METER_3_4)), 2);
  });
});

describe("eventPositions()", () => {
  it("returns nothing for a melody with no events", () => {
    assert.deepEqual(eventPositions(melodyOf([])), []);
  });

  it("places each event by where it starts", () => {
    const positions = eventPositions(
      melodyOf([note(), note(), note(), note()]),
    );

    assert.deepEqual(
      positions.map(({ bar, offset }) => [bar, offset.toString()]),
      [
        [0, "0/1"],
        [0, "1/4"],
        [0, "1/2"],
        [0, "3/4"],
      ],
    );
  });

  it("advances the bar when one fills", () => {
    const positions = eventPositions(
      melodyOf([note(), note(), note(), note(), note()]),
    );

    assert.deepEqual(positions[4], {
      index: 4,
      bar: 1,
      offset: f(0, 1),
      start: f(1, 1),
      length: f(1, 4),
    });
  });

  it("counts bars by the meter, not by whole notes", () => {
    const positions = eventPositions(
      melodyOf([note(), note(), note(), note()], METER_3_4),
    );

    assert.deepEqual(
      positions.map(({ bar, offset }) => [bar, offset.toString()]),
      [
        [0, "0/1"],
        [0, "1/4"],
        [0, "1/2"],
        [1, "0/1"],
      ],
    );
  });

  it("reports each event's own sounding length", () => {
    const positions = eventPositions(
      melodyOf([new Note(C4, HALF), new Rest(EIGHTH)]),
    );

    assert.deepEqual(
      positions.map(({ length }) => length.toString()),
      ["1/2", "1/8"],
    );
  });

  it("places an event that overruns a barline in the bar it starts in", () => {
    // The editor never makes one, but this has to stay total: it is what the
    // greying rules consult to decide that such a duration is unavailable.
    const positions = eventPositions(
      melodyOf([new Note(C4, HALF), new Note(C4, HALF)], METER_3_4),
    );

    assert.deepEqual(
      positions.map(({ bar, offset }) => [bar, offset.toString()]),
      [
        [0, "0/1"],
        [0, "1/2"],
      ],
    );
  });
});

describe("indexAtStart()", () => {
  it("finds the event beginning at a position", () => {
    const melody = melodyOf([note(), note(), note(), note(), note()]);

    assert.equal(indexAtStart(melody, f(0, 1)), 0);
    assert.equal(indexAtStart(melody, f(1, 2)), 2);
    assert.equal(indexAtStart(melody, f(1, 1)), 4);
  });

  it("returns undefined when nothing begins there", () => {
    const melody = melodyOf([new Note(C4, HALF), new Rest(HALF)]);

    assert.equal(indexAtStart(melody, f(1, 4)), undefined);
    assert.equal(indexAtStart(melody, f(9, 8)), undefined);
  });
});

describe("indexCovering()", () => {
  it("finds the event a position falls inside, not only one starting there", () => {
    const melody = melodyOf([new Note(C4, HALF), new Rest(HALF)]);

    assert.equal(indexCovering(melody, f(0, 1)), 0);
    assert.equal(indexCovering(melody, f(1, 4)), 0);
    assert.equal(indexCovering(melody, f(1, 2)), 1);
    assert.equal(indexCovering(melody, f(3, 4)), 1);
  });

  it("falls back to the last event for a position past the end", () => {
    // Editing can leave the melody shorter than where the edit began, once the
    // silence around it merges into one rest.
    const melody = melodyOf([new Rest(HALF)]);

    assert.equal(indexCovering(melody, f(3, 4)), 0);
  });

  it("returns undefined when there is nothing to cover it", () => {
    assert.equal(indexCovering(melodyOf([]), f(0, 1)), undefined);
  });
});

describe("totalLengthOf()", () => {
  it("adds up every event", () => {
    assert.equal(totalLengthOf(melodyOf([])).toString(), "0/1");
    assert.equal(
      totalLengthOf(melodyOf([note(), note(), new Rest(HALF)])).toString(),
      "1/1",
    );
    assert.equal(
      totalLengthOf(melodyOf([note(), new Rest(EIGHTH)])).toString(),
      "3/8",
    );
  });
});
