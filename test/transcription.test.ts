import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent, Rest, UnpitchedNote } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import {
  cleanDetails,
  countSoundingNotes,
  detailsProblem,
  firstSoundingNote,
  ID_LENGTH,
  isTranscriptionId,
  LIMITS,
  newTranscriptionId,
} from "../dist/shared/transcription.js";

const C4 = new Pitch("C", 0, 4);
const E4 = new Pitch("E", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);

const C_MAJOR = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;

const melodyOf = (events: readonly NoteEvent[]) =>
  new Melody(C_MAJOR, METER_4_4, events);

const notes = (count: number, pitch = C4) =>
  Array.from({ length: count }, () => new Note(pitch, QUARTER));

describe("newTranscriptionId()", () => {
  it("draws from Crockford's alphabet, which spells nothing and reads aloud", () => {
    // i, l and o are absent because they are 1, 1 and 0 to a reader; u is
    // absent so that no id ever accidentally spells an obscenity. That leaves
    // exactly 32, which matters: 256 divides by it, so no letter comes up
    // oftener than another.
    const id = newTranscriptionId();

    assert.equal(id.length, ID_LENGTH);
    assert.match(id, /^[0-9abcdefghjkmnpqrstvwxyz]+$/);
  });

  it("does not repeat itself", () => {
    const drawn = new Set(
      Array.from({ length: 500 }, () => newTranscriptionId()),
    );

    assert.equal(drawn.size, 500);
  });
});

describe("isTranscriptionId()", () => {
  it("accepts what newTranscriptionId() makes", () => {
    assert.equal(isTranscriptionId(newTranscriptionId()), true);
  });

  it("refuses anything that did not come from there", () => {
    // A URL can carry any of this, so nothing about it is assumed.
    for (const value of [
      "",
      "short",
      "aaaaaaaaaaaaa",
      "AAAAAAAAAAAA",
      "iiiiiiiiiiii",
      "aaaaaaaaaaa-",
      "../../etc/x",
      "1 OR 1=1",
      undefined,
      42,
      {},
    ]) {
      assert.equal(isTranscriptionId(value), false, `accepted ${String(value)}`);
    }
  });
});

describe("countSoundingNotes()", () => {
  it("counts a tied run once, however many noteheads it is written with", () => {
    // Ten heads, the first nine tied into one sound: two notes to find.
    const melody = melodyOf(notes(10));
    for (let i = 0; i < 8; i++) {
      melody.tie(i);
    }

    assert.equal(countSoundingNotes(melody), 2);
  });

  it("counts each of two runs that merely sit beside each other", () => {
    const melody = melodyOf([...notes(2, C4), ...notes(2, E4)]);
    melody.tie(0);
    melody.tie(2);

    assert.equal(countSoundingNotes(melody), 2);
  });

  it("passes over rests, which are nothing to find", () => {
    const melody = melodyOf([
      new Rest(QUARTER),
      new Note(C4, QUARTER),
      new Rest(QUARTER),
      new Note(E4, QUARTER),
    ]);

    assert.equal(countSoundingNotes(melody), 2);
  });

  it("counts a note still awaiting its pitch, since it is one to find", () => {
    const melody = melodyOf([new Note(C4, QUARTER), new UnpitchedNote(QUARTER)]);

    assert.equal(countSoundingNotes(melody), 2);
  });

  it("counts nothing in a melody of rests", () => {
    assert.equal(countSoundingNotes(melodyOf([new Rest(QUARTER)])), 0);
  });
});

describe("firstSoundingNote()", () => {
  it("skips the rests a melody opens with", () => {
    const melody = melodyOf([
      new Rest(QUARTER),
      new Rest(QUARTER),
      new Note(C4, QUARTER),
    ]);

    assert.deepEqual(firstSoundingNote(melody), [2]);
  });

  it("takes the whole tied run, not merely the head of it", () => {
    // Melody.tie() refuses to join a pitched note to an unpitched one, so a
    // puzzle that gave away half a run would not decode at the other end.
    const melody = melodyOf(notes(4));
    melody.tie(0);
    melody.tie(1);

    assert.deepEqual(firstSoundingNote(melody), [0, 1, 2]);
  });

  it("finds nothing in a melody of rests", () => {
    assert.equal(firstSoundingNote(melodyOf([new Rest(QUARTER)])), undefined);
  });
});

describe("detailsProblem()", () => {
  it("passes a title alone, since the rest is the author's choice", () => {
    assert.equal(detailsProblem({ title: "Clair de lune" }), undefined);
  });

  it("refuses a title of nothing but spaces", () => {
    assert.notEqual(detailsProblem({ title: "   " }), undefined);
    assert.notEqual(detailsProblem({ title: "" }), undefined);
  });

  it("refuses a title of nothing but characters that do not show", () => {
    // Long enough to pass a length check and still be a blank card.
    assert.notEqual(detailsProblem({ title: "\u200B\u200B\u200B" }), undefined);
  });

  it("takes every script and emoji, which are ordinary text", () => {
    for (const title of [
      "月光 第一楽章",
      "Лунная соната",
      "نشيد",
      "Für Elise 🎹",
      // A family emoji is joined by U+200D. Banning zero-width characters
      // outright would break this, and Persian and Devanagari with it.
      "For the family 👨‍👩‍👧",
    ]) {
      assert.equal(detailsProblem({ title }), undefined, `refused ${title}`);
    }
  });

  it("refuses control characters, which no title has and a card cannot show", () => {
    assert.notEqual(detailsProblem({ title: "Clair\nde lune" }), undefined);
    assert.notEqual(detailsProblem({ title: "Clair\tde lune" }), undefined);
    assert.notEqual(detailsProblem({ title: "Clair\u0000de lune" }), undefined);
  });

  it("refuses a bidirectional override, which makes a title read as another", () => {
    // U+202E reverses what follows, so a title can be shown as its own reverse.
    assert.notEqual(detailsProblem({ title: "gnp\u202Exe.exe" }), undefined);
  });

  it("allows newlines in a description, which is written in paragraphs", () => {
    assert.equal(
      detailsProblem({ title: "Clair de lune", description: "One.\n\nTwo." }),
      undefined,
    );
    // Everything else a description holds is still held to the same rule.
    assert.notEqual(
      detailsProblem({ title: "Clair de lune", description: "One.\u0000Two." }),
      undefined,
    );
  });

  it("measures length the way the database does, in characters", () => {
    // A family emoji is 8 UTF-16 units and 5 characters. SQLite's length()
    // counts characters, so counting the other way would pass text here and
    // then fail the CHECK constraint on the way in.
    const title = "👨‍👩‍👧".repeat(20); // 100 characters, 160 UTF-16 units
    assert.equal(title.length, 160);
    assert.equal([...title].length, LIMITS.title.max);

    assert.equal(detailsProblem({ title }), undefined);
    assert.notEqual(detailsProblem({ title: `${title}a` }), undefined);
  });

  it("refuses a title past its hundred characters", () => {
    assert.equal(
      detailsProblem({ title: "a".repeat(LIMITS.title.max) }),
      undefined,
    );
    assert.notEqual(
      detailsProblem({ title: "a".repeat(LIMITS.title.max + 1) }),
      undefined,
    );
  });

  it("refuses a description past its two thousand characters", () => {
    assert.notEqual(
      detailsProblem({
        title: "Clair de lune",
        description: "a".repeat(LIMITS.description.max + 1),
      }),
      undefined,
    );
  });

  it("refuses fields that are not text at all", () => {
    // The submit route hands this whatever arrived as JSON.
    assert.notEqual(detailsProblem({ title: 42 as never }), undefined);
    assert.notEqual(detailsProblem({ title: undefined as never }), undefined);
    assert.notEqual(
      detailsProblem({ title: "Clair de lune", subtitle: [] as never }),
      undefined,
    );
  });
});

describe("cleanDetails()", () => {
  it("trims the edges off every field", () => {
    assert.deepEqual(cleanDetails({ title: "  Clair de lune  " }), {
      title: "Clair de lune",
      subtitle: undefined,
      description: undefined,
    });
  });

  it("drops a field that was only spaces, rather than storing emptiness", () => {
    assert.deepEqual(
      cleanDetails({ title: "Clair de lune", subtitle: "   ", description: "" }),
      { title: "Clair de lune", subtitle: undefined, description: undefined },
    );
  });

  it("settles accents into one spelling, so length and equality are steady", () => {
    // U+00E9 arrives either as one character or as "e" plus a combining accent,
    // depending on the keyboard it was typed on. Both are the same word.
    const composed = cleanDetails({ title: "Caf\u00E9" }).title;
    const decomposed = cleanDetails({ title: "Cafe\u0301" }).title;

    assert.equal(composed, decomposed);
    assert.equal([...decomposed].length, 4);
  });
});
