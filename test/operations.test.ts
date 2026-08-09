import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  availableSpaceAt,
  convertToRestAt,
  emptyMelody,
  pitchNudgeFrom,
  type Room,
  roomAt,
  tieForward,
  writeAt,
} from "../dist/editor/operations.js";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { splitIntoMeasures } from "../dist/music/measure.js";
import { Melody } from "../dist/music/melody.js";
import {
  Note,
  type NoteEvent,
  Rest,
  UnpitchedNote,
} from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { normalize } from "../dist/editor/normalize.js";

const C4 = new Pitch("C", 0, 4);
const D4 = new Pitch("D", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);
const WHOLE = new Duration(NoteValue.Whole);
const EIGHTH = new Duration(NoteValue.Eighth);

const KEY = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;
const METER_3_4 = { beats: 3, beatUnit: 4 } as const;

const quarter = () => new Note(C4, QUARTER);

/** A melody already in the shape the editor keeps it in. */
function editable(
  events: readonly NoteEvent[],
  meter: typeof METER_4_4 | typeof METER_3_4 = METER_4_4,
): Melody {
  const melody = new Melody(KEY, meter, events);
  normalize(melody);
  return melody;
}

const barCount = (melody: Melody) => splitIntoMeasures(melody).length;

/** Fractions compare badly with deepEqual, so read the room as strings. */
const reported = ({ available, limitedBy }: Room) => ({
  available: available.toString(),
  limitedBy,
});

describe("emptyMelody()", () => {
  it("opens on one bar of rests, ready to be written into", () => {
    assert.equal(emptyMelody(KEY, METER_4_4).toString(), "b4/w/r");
    assert.equal(emptyMelody(KEY, METER_3_4).toString(), "b4/h./r");
  });

  it("opens on as many bars as it is told", () => {
    assert.equal(
      emptyMelody(KEY, METER_4_4, 3).toString(),
      "b4/w/r, b4/w/r, b4/w/r",
    );
    assert.equal(
      emptyMelody(KEY, METER_3_4, 2).toString(),
      "b4/h./r, b4/h./r",
    );
  });

  it("keeps that many bars through writing and erasing", () => {
    // The count is what the video's timing marks were measured against, so no
    // edit may change it: writing into the last bar must not add one, and
    // erasing the only note must not take any away.
    const melody = emptyMelody(KEY, METER_4_4, 2);
    const written = writeAt(melody, melody.eventCount - 1, QUARTER, "note");
    assert.equal(barCount(melody), 2);

    convertToRestAt(melody, written);
    assert.equal(barCount(melody), 2);
    assert.equal(melody.toString(), "b4/w/r, b4/w/r");
  });
});

describe("availableSpaceAt()", () => {
  it("offers the whole bar when nothing is written in it", () => {
    assert.equal(availableSpaceAt(emptyMelody(KEY, METER_4_4), 0).toString(), "1/1");
    assert.equal(availableSpaceAt(emptyMelody(KEY, METER_3_4), 0).toString(), "3/4");
  });

  it("counts the rests that follow, since they are room to grow into", () => {
    const melody = editable([quarter()]);

    assert.equal(availableSpaceAt(melody, 0).toString(), "1/1");
  });

  it("stops at the next note", () => {
    const melody = editable([quarter(), quarter()]);

    assert.equal(availableSpaceAt(melody, 0).toString(), "1/4");
  });

  it("stops at the barline", () => {
    // The last beat of a full bar, with a whole bar of rests waiting after it.
    const melody = editable([quarter(), quarter(), quarter(), quarter()]);

    assert.equal(availableSpaceAt(melody, 3).toString(), "1/4");
  });

  it("measures a rest from its own start", () => {
    const melody = editable([quarter()]);

    // "c4/q, b4/q/r, b4/h/r, b4/w/r"
    assert.equal(availableSpaceAt(melody, 1).toString(), "3/4");
    assert.equal(availableSpaceAt(melody, 2).toString(), "1/2");
  });

  it("throws RangeError for an index outside the melody", () => {
    assert.throws(() => availableSpaceAt(emptyMelody(KEY, METER_4_4), 3), RangeError);
  });
});

describe("roomAt()", () => {
  it("says the barline is the limit when only rests follow", () => {
    assert.deepEqual(reported(roomAt(emptyMelody(KEY, METER_4_4), 0)), {
      available: "1/1",
      limitedBy: "barline",
    });
    assert.deepEqual(reported(roomAt(editable([quarter()]), 0)), {
      available: "1/1",
      limitedBy: "barline",
    });
  });

  it("says the next note is the limit when one is in the way", () => {
    assert.deepEqual(reported(roomAt(editable([quarter(), quarter()]), 0)), {
      available: "1/4",
      limitedBy: "next-note",
    });
  });

  it("says the barline when the bar runs out first", () => {
    const melody = editable([quarter(), quarter(), quarter(), quarter()]);

    assert.deepEqual(reported(roomAt(melody, 3)), {
      available: "1/4",
      limitedBy: "barline",
    });
  });

  it("agrees with availableSpaceAt()", () => {
    const melody = editable([quarter(), quarter()]);

    for (let i = 0; i < melody.eventCount; i++) {
      assert.equal(
        roomAt(melody, i).available.toString(),
        availableSpaceAt(melody, i).toString(),
      );
    }
  });
});

describe("writeAt()", () => {
  it("writes into a rest, leaving the rest of the bar as rests", () => {
    const melody = emptyMelody(KEY, METER_4_4);

    writeAt(melody, 0, QUARTER, "note");

    assert.equal(melody.toString(), "x/q, b4/q/r, b4/h/r");
  });

  it("writes a note with no pitch yet, for pitching later", () => {
    const melody = emptyMelody(KEY, METER_4_4);

    writeAt(melody, 0, QUARTER, "note");

    assert.equal(melody.isFullyPitched(), false);
  });

  it("returns where the written event ended up", () => {
    const melody = emptyMelody(KEY, METER_4_4);

    assert.equal(writeAt(melody, 0, QUARTER, "note"), 0);
    // Writing into the second event of the bar, once one exists.
    assert.equal(writeAt(melody, 1, EIGHTH, "note"), 1);
  });

  it("grows a note into the rests after it", () => {
    const melody = editable([quarter()]);

    writeAt(melody, 0, HALF, "note");

    assert.equal(melody.toString(), "c4/h, b4/h/r");
  });

  it("shrinks a note, handing the room back as rests", () => {
    const melody = editable([new Note(C4, HALF)]);

    writeAt(melody, 0, QUARTER, "note");

    assert.equal(melody.toString(), "c4/q, b4/q/r, b4/h/r");
  });

  it("keeps a note's pitch when only its length changes", () => {
    const melody = editable([new Note(D4, HALF)]);

    writeAt(melody, 0, QUARTER, "note");

    assert.equal(melody.getEvent(0).isEqual(new Note(D4, QUARTER)), true);
  });

  it("never moves a barline", () => {
    const melody = editable([quarter(), quarter(), quarter(), quarter()]);
    const before = barCount(melody);

    writeAt(melody, 1, EIGHTH, "note");

    assert.equal(barCount(melody), before);
    assert.doesNotThrow(() => splitIntoMeasures(melody));
  });

  it("fills a bar exactly when the duration uses all the room", () => {
    const melody = emptyMelody(KEY, METER_4_4);

    writeAt(melody, 0, WHOLE, "note");

    assert.equal(melody.toString(), "x/w");
  });

  it("throws RangeError for a duration longer than the room available", () => {
    const melody = editable([quarter(), quarter()]);

    assert.throws(
      () => writeAt(melody, 0, HALF, "note"),
      (error: unknown) =>
        error instanceof RangeError &&
        /does not fit/.test(error.message) &&
        // The editor puts this in front of whoever is writing the music, word
        // for word, so it has to say what they tried rather than where in an
        // array it happened.
        !/index/.test(error.message),
    );
  });

  it("throws RangeError rather than overrunning a barline", () => {
    const melody = editable([quarter(), quarter(), quarter(), quarter()]);

    assert.throws(() => writeAt(melody, 3, HALF, "note"), RangeError);
  });

  it("writes a rest when asked for one", () => {
    const melody = editable([new Note(C4, HALF)]);

    writeAt(melody, 0, QUARTER, "rest");

    // The new rest joins the silence after it and is written as one stretch.
    assert.equal(melody.toString(), "b4/w/r");
  });

  it("keeps a tie to the note before when only the length changes", () => {
    const melody = editable([new Note(C4, QUARTER), new Note(C4, QUARTER)]);
    melody.tie(0);

    writeAt(melody, 1, HALF, "note");

    assert.equal(melody.isTiedToNext(0), true);
    assert.equal(melody.toString(), "c4/q, c4/h, b4/q/r");
  });

  it("drops a tie the new event can no longer honour", () => {
    const melody = editable([new Note(C4, QUARTER), new Note(C4, QUARTER)]);
    melody.tie(0);

    // Silence cannot be tied to a note, so the tie has to go.
    writeAt(melody, 1, QUARTER, "rest");

    assert.equal(melody.isTiedToNext(0), false);
  });
});

describe("convertToRestAt()", () => {
  it("turns a note into silence of the same length", () => {
    const melody = editable([quarter(), quarter(), quarter(), quarter()]);

    convertToRestAt(melody, 1);

    assert.equal(melody.toString(), "c4/q, b4/q/r, c4/q, c4/q");
  });

  it("never moves a barline", () => {
    const melody = editable([quarter(), quarter(), quarter(), quarter()]);
    const before = barCount(melody);

    convertToRestAt(melody, 1);

    assert.equal(barCount(melody), before);
  });

  it("merges the silence it leaves with the rests around it", () => {
    const melody = editable([quarter(), quarter()]);

    convertToRestAt(melody, 1);

    // The second note was the last; its silence joins the bar's trailing rests
    // without the bar count moving.
    assert.equal(melody.toString(), "c4/q, b4/q/r, b4/h/r");
  });

  it("is undone by writing a note back over it", () => {
    const melody = editable([quarter(), quarter(), quarter(), quarter()]);
    const before = melody.toString();

    const index = convertToRestAt(melody, 1);
    writeAt(melody, index, QUARTER, "note");
    melody.setPitch(index, C4);

    assert.equal(melody.toString(), before);
  });

  it("returns where the resulting rest begins", () => {
    const melody = editable([quarter(), quarter(), quarter(), quarter()]);

    // The rest left behind merges with nothing here, so it keeps the index.
    assert.equal(convertToRestAt(melody, 2), 2);
  });

  it("returns an index the melody still has, after silence merges away", () => {
    // Two notes, then both turned back into rests. The second one leaves the
    // bar entirely silent, so every rest in it merges into one whole rest and
    // the melody ends up shorter than the index the edit started from.
    const melody = emptyMelody(KEY, METER_4_4);
    writeAt(melody, 0, QUARTER, "note");
    writeAt(melody, 1, QUARTER, "note");
    convertToRestAt(melody, 0);

    const index = convertToRestAt(melody, 1);

    assert.equal(melody.toString(), "b4/w/r");
    assert.ok(
      index >= 0 && index < melody.eventCount,
      `index ${index} is outside a melody of ${melody.eventCount} events`,
    );
    assert.doesNotThrow(() => melody.getEvent(index));
  });

  it("returns the event now covering where the edit was made", () => {
    const melody = emptyMelody(KEY, METER_4_4);
    writeAt(melody, 0, QUARTER, "note");
    writeAt(melody, 1, QUARTER, "note");
    writeAt(melody, 2, QUARTER, "note");

    // Silencing the middle note merges it with nothing, so it stays put.
    assert.equal(convertToRestAt(melody, 1), 1);
  });

  it("drops any ties the note was part of", () => {
    const melody = editable([new Note(C4, QUARTER), new Note(C4, QUARTER)]);
    melody.tie(0);

    convertToRestAt(melody, 0);

    assert.equal(melody.isTiedToNext(0), false);
  });
});

describe("tieForward()", () => {
  it("ties two notes that are both awaiting a pitch", () => {
    const melody = emptyMelody(KEY, METER_4_4);
    writeAt(melody, 0, HALF, "note");
    writeAt(melody, 1, HALF, "note");

    tieForward(melody, 0);

    assert.equal(melody.isTiedToNext(0), true);
  });

  it("gives the second note the first's pitch, which is what a tie means", () => {
    const melody = editable([new Note(C4, HALF), new Note(D4, HALF)]);

    tieForward(melody, 0);

    assert.equal(melody.isTiedToNext(0), true);
    assert.equal(melody.getEvent(1).isEqual(new Note(C4, HALF)), true);
  });

  it("ties across a barline, which is the reason it exists", () => {
    const melody = editable([
      quarter(),
      quarter(),
      quarter(),
      quarter(),
      quarter(),
    ]);

    tieForward(melody, 3);

    assert.equal(melody.isTiedToNext(3), true);
    assert.equal(splitIntoMeasures(melody)[0]!.tiedToNextBar, true);
  });

  it("throws TypeError when either end is a rest", () => {
    const melody = editable([quarter()]);

    assert.throws(() => tieForward(melody, 0), TypeError);
  });
});

describe("Melody canTie()", () => {
  it("agrees with what tie() would do", () => {
    const melody = editable([new Note(C4, QUARTER), new Note(C4, QUARTER)]);

    assert.equal(melody.canTie(0), true);
    // Index 1 is followed by a rest.
    assert.equal(melody.canTie(1), false);
  });

  it("is false at the ends of the melody", () => {
    const melody = editable([quarter()]);

    assert.equal(melody.canTie(-1), false);
    assert.equal(melody.canTie(melody.eventCount - 1), false);
  });

  it("is false between notes that disagree on pitch", () => {
    const melody = editable([new Note(C4, QUARTER), new Note(D4, QUARTER)]);

    assert.equal(melody.canTie(0), false);
  });
});

describe("pitchNudgeFrom()", () => {
  /** Somewhere obviously not near any note in these melodies. */
  const FALLBACK = 71;

  it("starts a pitched note from its own pitch", () => {
    const melody = editable([new Note(D4, QUARTER)]);

    assert.equal(pitchNudgeFrom(melody, 0, FALLBACK), D4.toMidi());
  });

  it("starts an unpitched note from the note before it", () => {
    // Melodies mostly move by step, so the neighbour is the useful guess: one
    // press of Up lands a semitone above whatever was last written.
    const melody = editable([
      new Note(D4, QUARTER),
      new UnpitchedNote(QUARTER),
    ]);

    assert.equal(pitchNudgeFrom(melody, 1, FALLBACK), D4.toMidi());
  });

  it("looks past rests and other blanks to find one", () => {
    const melody = editable([
      new Note(D4, QUARTER),
      new UnpitchedNote(QUARTER),
      new Rest(QUARTER),
      new UnpitchedNote(QUARTER),
    ]);

    assert.equal(pitchNudgeFrom(melody, 3, FALLBACK), D4.toMidi());
  });

  it("takes the nearest one, not the first", () => {
    const melody = editable([
      new Note(C4, QUARTER),
      new Note(D4, QUARTER),
      new UnpitchedNote(QUARTER),
    ]);

    assert.equal(pitchNudgeFrom(melody, 2, FALLBACK), D4.toMidi());
  });

  it("falls back when nothing pitched comes before it", () => {
    const melody = editable([
      new Rest(QUARTER),
      new UnpitchedNote(QUARTER),
    ]);

    assert.equal(pitchNudgeFrom(melody, 1, FALLBACK), FALLBACK);
  });

  it("never looks forward, so the answer does not depend on what is ahead", () => {
    const melody = editable([
      new UnpitchedNote(QUARTER),
      new Note(D4, QUARTER),
    ]);

    assert.equal(pitchNudgeFrom(melody, 0, FALLBACK), FALLBACK);
  });

  it("gives a rest nothing, because a rest has no pitch to move", () => {
    const melody = editable([new Note(D4, QUARTER), new Rest(QUARTER)]);

    assert.equal(pitchNudgeFrom(melody, 1, FALLBACK), undefined);
  });
});
