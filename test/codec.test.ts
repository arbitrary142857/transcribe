import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decode, encode, parseMelodyJson } from "../dist/editor/codec.js";
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

describe("parseMelodyJson()", () => {
  /** What a well-formed melody looks like, to be spoiled one field at a time. */
  const sound = () => {
    const melody = melodyOf([
      new Note(C4, HALF),
      new Note(C4, HALF),
      new UnpitchedNote(QUARTER),
      new Rest(QUARTER),
    ]);
    melody.tie(0);
    return JSON.parse(JSON.stringify(encode(melody))) as ReturnType<typeof encode>;
  };

  /** Spoil one field and expect the whole thing refused. */
  const spoiled = (wreck: (json: ReturnType<typeof encode>) => void) => {
    const json = sound();
    wreck(json);
    return parseMelodyJson(json);
  };

  it("passes what encode() produces, which is the only thing it must", () => {
    const json = sound();

    const parsed = parseMelodyJson(json);

    assert.notEqual(parsed, undefined);
    assert.deepEqual(parsed, json);
  });

  it("passes a melody with nothing in it", () => {
    assert.notEqual(parseMelodyJson(encode(melodyOf([]))), undefined);
  });

  it("refuses anything that is not an object at all", () => {
    // A request body is whatever arrived; none of this is a melody.
    for (const value of [undefined, null, 0, "", "melody", [], true]) {
      assert.equal(parseMelodyJson(value), undefined, `took ${String(value)}`);
    }
  });

  it("refuses a letter that is not a note name", () => {
    // decode() would build a Pitch whose semitone is undefined and carry on.
    assert.equal(spoiled((j) => ((j.key.letter as string) = "H")), undefined);
    assert.equal(spoiled((j) => ((j.key.letter as string) = "c")), undefined);
    assert.equal(spoiled((j) => ((j.key.letter as unknown) = 1)), undefined);
  });

  it("refuses an accidental beyond a double flat or double sharp", () => {
    assert.equal(spoiled((j) => ((j.key.accidental as number) = 3)), undefined);
    assert.equal(spoiled((j) => ((j.key.accidental as number) = -3)), undefined);
    assert.equal(spoiled((j) => ((j.key.accidental as number) = 0.5)), undefined);
  });

  it("refuses an octave that is not a whole number in earshot", () => {
    assert.equal(spoiled((j) => (j.key.octave = 4.5)), undefined);
    assert.equal(spoiled((j) => (j.key.octave = 1000)), undefined);
    assert.equal(spoiled((j) => (j.key.octave = Number.NaN)), undefined);
  });

  it("refuses a mode that is neither major nor minor", () => {
    assert.equal(spoiled((j) => ((j.key.mode as string) = "dorian")), undefined);
  });

  it("refuses a meter no note value could fill", () => {
    assert.equal(spoiled((j) => ((j.meter as { beats: number }).beats = 0)), undefined);
    assert.equal(spoiled((j) => ((j.meter as { beats: number }).beats = 2.5)), undefined);
    assert.equal(
      spoiled((j) => ((j.meter as { beatUnit: number }).beatUnit = 5)),
      undefined,
    );
  });

  it("refuses an event whose kind names nothing", () => {
    assert.equal(spoiled((j) => ((j.events[0]!.kind as string) = "chord")), undefined);
    assert.equal(spoiled((j) => (j.events[0] = undefined as never)), undefined);
  });

  it("refuses a note value that is not a note value", () => {
    // 3 is not a duration; decode() would cast it through and Duration would
    // hold a length nothing can be written in.
    assert.equal(spoiled((j) => (j.events[0]!.duration.value = 3)), undefined);
    assert.equal(spoiled((j) => (j.events[0]!.duration.value = 64)), undefined);
  });

  it("refuses dots that are negative, fractional or absurd", () => {
    assert.equal(spoiled((j) => (j.events[0]!.duration.dots = -1)), undefined);
    assert.equal(spoiled((j) => (j.events[0]!.duration.dots = 1.5)), undefined);
    assert.equal(spoiled((j) => (j.events[0]!.duration.dots = 99)), undefined);
  });

  it("refuses a tuplet ratio that is not two positive whole numbers", () => {
    assert.equal(
      spoiled((j) => (j.events[0]!.duration.ratio = [0, 2])),
      undefined,
    );
    assert.equal(
      spoiled((j) => (j.events[0]!.duration.ratio = [3, -2])),
      undefined,
    );
    assert.equal(
      spoiled((j) => (j.events[0]!.duration.ratio = [3] as never)),
      undefined,
    );
  });

  it("refuses a note with no pitch on it", () => {
    assert.equal(
      spoiled((j) => delete (j.events[0] as { pitch?: unknown }).pitch),
      undefined,
    );
  });

  it("refuses a tie pointing outside the events it joins", () => {
    // decode() calls melody.tie(index), which throws RangeError on these --
    // a 500 where the caller deserves a 400.
    assert.equal(spoiled((j) => (j.ties = [-1])), undefined);
    assert.equal(spoiled((j) => (j.ties = [3])), undefined);
    assert.equal(spoiled((j) => (j.ties = [1.5])), undefined);
    assert.equal(spoiled((j) => (j.ties = [0, 0])), undefined);
  });

  it("refuses a tuplet bracket reaching past the end", () => {
    assert.equal(
      spoiled((j) => (j.tuplets = [{ start: 2, count: 9, numNotes: 3, inTimeOf: 2 }])),
      undefined,
    );
    assert.equal(
      spoiled((j) => (j.tuplets = [{ start: -1, count: 3, numNotes: 3, inTimeOf: 2 }])),
      undefined,
    );
    assert.equal(
      spoiled((j) => (j.tuplets = [{ start: 0, count: 0, numNotes: 3, inTimeOf: 2 }])),
      undefined,
    );
  });

  it("refuses fields that arrived as the wrong kind of thing entirely", () => {
    assert.equal(spoiled((j) => ((j.events as unknown) = {})), undefined);
    assert.equal(spoiled((j) => ((j.ties as unknown) = "0")), undefined);
    assert.equal(spoiled((j) => ((j.key as unknown) = undefined)), undefined);
  });

  it("keeps nothing the melody did not carry", () => {
    // Whatever else was in the body stays out of the database.
    const json = sound() as Record<string, unknown>;
    json.melody = "'; DROP TABLE transcriptions; --";
    json.__proto__ = { polluted: true };

    const parsed = parseMelodyJson(json) as Record<string, unknown> | undefined;

    assert.notEqual(parsed, undefined);
    assert.deepEqual(Object.keys(parsed!).sort(), [
      "events",
      "key",
      "meter",
      "ties",
      "tuplets",
    ]);
  });

  it("hands back something decode() takes without throwing", () => {
    const parsed = parseMelodyJson(sound());

    assert.notEqual(parsed, undefined);
    assert.equal(decode(parsed!).eventCount, 4);
  });
});
