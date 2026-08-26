import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent, Rest, UnpitchedNote } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { decode, encode, parseMelodyJson } from "../dist/editor/codec.js";
import {
  cleanDetails,
  countSoundingNotes,
  countUnpitchedNotes,
  detailsProblem,
  firstSoundingNote,
  gradeAttempt,
  ID_LENGTH,
  isTranscriptionId,
  LIMITS,
  newTranscriptionId,
  puzzleMelodyOf,
  sameMusic,
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

describe("countUnpitchedNotes()", () => {
  it("counts a tied run of them once, exactly as its pitched twin counts", () => {
    // Two notes awaiting a pitch may be tied, since they will be pitched
    // together — so an unpitched run is one note to find, not four.
    const melody = melodyOf([
      new UnpitchedNote(QUARTER),
      new UnpitchedNote(QUARTER),
      new UnpitchedNote(QUARTER),
      new UnpitchedNote(QUARTER),
    ]);
    melody.tie(0);
    melody.tie(1);
    melody.tie(2);

    assert.equal(countUnpitchedNotes(melody), 1);
    assert.equal(countSoundingNotes(melody), 1);
  });

  it("counts nothing once every note has a pitch", () => {
    const melody = melodyOf(notes(3));

    assert.equal(countUnpitchedNotes(melody), 0);
  });

  it("passes over rests, which are waiting for nothing", () => {
    const melody = melodyOf([new Rest(QUARTER), new UnpitchedNote(QUARTER)]);

    assert.equal(countUnpitchedNotes(melody), 1);
  });

  it("never counts more than there are notes at all", () => {
    // The database says so too, and a count that broke this would be a card
    // claiming more notes are missing than the level has.
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new UnpitchedNote(QUARTER),
      new Rest(QUARTER),
      new UnpitchedNote(QUARTER),
    ]);

    assert.equal(countUnpitchedNotes(melody), 2);
    assert.equal(countSoundingNotes(melody), 3);
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

  it("takes a difficulty of half a pepper to five, in halves, and refuses any other", () => {
    for (const difficulty of [0.5, 2.5, 5]) {
      assert.equal(detailsProblem({ title: "x", difficulty }), undefined, `refused ${difficulty}`);
    }
    for (const difficulty of [0, 5.5, 2.25, "3", Number.NaN]) {
      assert.match(
        detailsProblem({ title: "x", difficulty: difficulty as never }) ?? "",
        /difficulty/i,
        `accepted ${String(difficulty)}`,
      );
    }
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

  it("allows newlines in instructions, which are written a line at a time", () => {
    assert.equal(
      detailsProblem({ title: "Clair de lune", instructions: "One.\n\nTwo." }),
      undefined,
    );
    // Everything else instructions hold is still held to the same rule.
    assert.notEqual(
      detailsProblem({ title: "Clair de lune", instructions: "One.\u0000Two." }),
      undefined,
    );
  });

  it("measures length the way the database does, in characters", () => {
    // A family emoji is 8 UTF-16 units and 5 characters. SQLite's length()
    // counts characters, so counting the other way would pass text here and
    // then fail the CHECK constraint on the way in.
    // 25 families is 125 characters; three letters bring it to exactly the cap.
    const title = "👨‍👩‍👧".repeat(25) + "abc";
    assert.equal([...title].length, LIMITS.title.max);
    assert.ok(title.length > LIMITS.title.max, "not counting UTF-16 units");

    assert.equal(detailsProblem({ title }), undefined);
    assert.notEqual(detailsProblem({ title: `${title}a` }), undefined);
  });

  it("refuses a title past its cap", () => {
    assert.equal(
      detailsProblem({ title: "a".repeat(LIMITS.title.max) }),
      undefined,
    );
    assert.notEqual(
      detailsProblem({ title: "a".repeat(LIMITS.title.max + 1) }),
      undefined,
    );
  });

  it("refuses instructions past their cap", () => {
    assert.notEqual(
      detailsProblem({
        title: "Clair de lune",
        instructions: "a".repeat(LIMITS.instructions.max + 1),
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
      instructions: undefined,
      difficulty: undefined,
    });
  });

  it("drops a field that was only spaces, rather than storing emptiness", () => {
    assert.deepEqual(
      cleanDetails({ title: "Clair de lune", subtitle: "   ", instructions: "" }),
      { title: "Clair de lune", subtitle: undefined, instructions: undefined, difficulty: undefined },
    );
  });

  it("carries the difficulty through as the author set it", () => {
    assert.equal(cleanDetails({ title: "x", difficulty: 2.5 }).difficulty, 2.5);
    assert.equal(cleanDetails({ title: "x" }).difficulty, undefined);
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

describe("puzzleMelodyOf()", () => {
  it("gives away the first note and takes the pitch off every note after it", () => {
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new Note(E4, QUARTER),
      new Note(C4, QUARTER),
    ]);

    const puzzle = puzzleMelodyOf(melody);

    assert.ok(puzzle.getEvent(0) instanceof Note);
    assert.ok(puzzle.getEvent(1) instanceof UnpitchedNote);
    assert.ok(puzzle.getEvent(2) instanceof UnpitchedNote);
  });

  it("gives away the whole tied run, so what is left still decodes", () => {
    // Melody.tie() refuses to join a pitched note to an unpitched one. Revealing
    // only the head of the opening run would build a melody that throws on the
    // way back in -- which is the failure this whole function exists to avoid.
    const melody = melodyOf(notes(4));
    melody.tie(0);
    melody.tie(1);

    const puzzle = puzzleMelodyOf(melody);
    const overTheWire = JSON.parse(JSON.stringify(encode(puzzle))) as unknown;
    const parsed = parseMelodyJson(overTheWire);

    assert.notEqual(parsed, undefined);
    assert.doesNotThrow(() => decode(parsed!));
    for (const index of [0, 1, 2]) {
      assert.ok(puzzle.getEvent(index) instanceof Note);
    }
    assert.ok(puzzle.getEvent(3) instanceof UnpitchedNote);
  });

  it("keeps every rest a rest, since a rest was never an answer", () => {
    const melody = melodyOf([
      new Rest(QUARTER),
      new Note(C4, QUARTER),
      new Rest(QUARTER),
      new Note(E4, QUARTER),
    ]);

    const puzzle = puzzleMelodyOf(melody);

    assert.ok(puzzle.getEvent(0) instanceof Rest);
    assert.ok(puzzle.getEvent(1) instanceof Note);
    assert.ok(puzzle.getEvent(2) instanceof Rest);
    assert.ok(puzzle.getEvent(3) instanceof UnpitchedNote);
  });

  it("leaves the melody it was handed untouched", () => {
    // Melody is mutable and this one is the answer, held by whatever route
    // called in. Stripping it in place would empty the copy of record.
    const melody = melodyOf([new Note(C4, QUARTER), new Note(E4, QUARTER)]);

    puzzleMelodyOf(melody);

    assert.equal(countUnpitchedNotes(melody), 0);
  });

  it("carries the key, the meter and the rhythm across", () => {
    // All three are public: the key and the meter are their own columns, and
    // the rhythm is the puzzle rather than the answer to it.
    const melody = melodyOf([new Note(C4, QUARTER), new Note(E4, QUARTER)]);

    const puzzle = puzzleMelodyOf(melody);

    assert.ok(puzzle.keySignature.isEqual(melody.keySignature));
    assert.deepEqual(puzzle.timeSignature, melody.timeSignature);
    assert.equal(puzzle.eventCount, melody.eventCount);
    assert.equal(countSoundingNotes(puzzle), countSoundingNotes(melody));
  });

  it("finds nothing to give away in a melody of rests", () => {
    const melody = melodyOf([new Rest(QUARTER), new Rest(QUARTER)]);

    assert.equal(countSoundingNotes(puzzleMelodyOf(melody)), 0);
  });
});

describe("gradeAttempt()", () => {
  it("marks a note by how it sounds, not by how it is spelled", () => {
    // You never choose a spelling -- you press a piano key and spellForMelodyEvent
    // decides -- so an answer written D sharp has to accept the E flat that the
    // key signature would have produced for the same sound.
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new Note(new Pitch("D", 1, 4), QUARTER),
    ]);

    const graded = gradeAttempt(
      melody,
      new Map([
        [0, C4.toMidi()],
        [1, new Pitch("E", -1, 4).toMidi()],
      ]),
    );

    assert.equal(graded.verdicts.get(1), true);
    assert.equal(graded.correct, 2);
    assert.equal(graded.total, 2);
  });

  it("hears the octave, so the right letter in the wrong one is wrong", () => {
    const melody = melodyOf([new Note(C4, QUARTER), new Note(E4, QUARTER)]);

    const graded = gradeAttempt(
      melody,
      new Map([
        [0, C4.toMidi()],
        [1, new Pitch("E", 0, 5).toMidi()],
      ]),
    );

    assert.equal(graded.verdicts.get(1), false);
    assert.equal(graded.correct, 1);
  });

  it("keys its verdicts by the head of a tied run, which is one sound", () => {
    const melody = melodyOf(notes(3, C4));
    melody.tie(0);
    melody.tie(1);

    const graded = gradeAttempt(melody, new Map([[0, C4.toMidi()]]));

    assert.deepEqual([...graded.verdicts.keys()], [0]);
    assert.equal(graded.total, 1);
    assert.equal(graded.correct, 1);
  });

  it("skips rests, which nobody is asked to find", () => {
    const melody = melodyOf([
      new Rest(QUARTER),
      new Note(C4, QUARTER),
      new Rest(QUARTER),
    ]);

    const graded = gradeAttempt(melody, new Map([[1, C4.toMidi()]]));

    assert.deepEqual([...graded.verdicts.keys()], [1]);
    assert.equal(graded.total, 1);
  });

  it("marks a note nobody answered wrong rather than overlooking it", () => {
    const melody = melodyOf([new Note(C4, QUARTER), new Note(E4, QUARTER)]);

    const graded = gradeAttempt(melody, new Map([[0, C4.toMidi()]]));

    assert.equal(graded.verdicts.get(1), false);
    assert.equal(graded.correct, 1);
    assert.equal(graded.total, 2);
  });

  it("counts the given note among the total, as the card's note count does", () => {
    // A card advertising twelve notes and a puzzle reporting eleven correct out
    // of eleven would be two numbers describing the same melody and disagreeing.
    const melody = melodyOf(notes(3));

    const graded = gradeAttempt(
      melody,
      new Map([
        [0, C4.toMidi()],
        [1, C4.toMidi()],
        [2, C4.toMidi()],
      ]),
    );

    assert.equal(graded.total, countSoundingNotes(melody));
  });
});

describe("sameMusic()", () => {
  it("calls a melody the same as its own round trip through the codec", () => {
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Rest(QUARTER),
      new UnpitchedNote(QUARTER),
    ]);
    melody.tie(0);

    assert.equal(sameMusic(melody, decode(encode(melody))), true);
  });

  it("tells two melodies apart by pitch, by rhythm and by tie", () => {
    const base = () =>
      melodyOf([new Note(C4, QUARTER), new Note(C4, QUARTER), new Note(E4, QUARTER)]);

    const repitched = base();
    repitched.setPitch(2, new Pitch("G", 0, 4));
    assert.equal(sameMusic(base(), repitched), false);

    const rerhythmed = melodyOf([
      new Note(C4, new Duration(NoteValue.Half)),
      new Note(E4, QUARTER),
      new Rest(QUARTER),
    ]);
    assert.equal(sameMusic(base(), rerhythmed), false);

    const tied = base();
    tied.tie(0);
    assert.equal(sameMusic(base(), tied), false);
  });

  it("counts a respelling as a change, since a score shows the spelling", () => {
    // The check route forgives this because nobody chooses a spelling when
    // playing. An author editing a published score is choosing one.
    const sharp = melodyOf([new Note(C4, QUARTER), new Note(new Pitch("D", 1, 4), QUARTER)]);
    const flat = melodyOf([new Note(C4, QUARTER), new Note(new Pitch("E", -1, 4), QUARTER)]);

    assert.equal(sameMusic(sharp, flat), false);
  });
});
