import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent, Rest, UnpitchedNote } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import {
  attemptOf,
  attemptsLabel,
  checkProblem,
  judgedOf,
  marksOf,
  rememberVerdicts,
  verdictsFrom,
  verdictsOf,
} from "../dist/puzzle/verdicts.js";

const C4 = new Pitch("C", 0, 4);
const E4 = new Pitch("E", 0, 4);
const G4 = new Pitch("G", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const C_MAJOR = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;

const melodyOf = (events: readonly NoteEvent[]) =>
  new Melody(C_MAJOR, METER_4_4, events);

const NONE: ReadonlySet<number> = new Set();

describe("attemptOf()", () => {
  it("reads one pitch per sounding note, keyed by the head of its run", () => {
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(E4, QUARTER),
    ]);
    melody.tie(0);

    assert.deepEqual(
      [...attemptOf(melody)],
      [
        [0, C4.toMidi()],
        [2, E4.toMidi()],
      ],
    );
  });

  it("passes over rests and notes still awaiting a pitch", () => {
    const melody = melodyOf([
      new Rest(QUARTER),
      new Note(C4, QUARTER),
      new UnpitchedNote(QUARTER),
    ]);

    assert.deepEqual([...attemptOf(melody).keys()], [1]);
  });
});

describe("checkProblem()", () => {
  it("says nothing once every note has a pitch", () => {
    assert.equal(
      checkProblem(melodyOf([new Note(C4, QUARTER), new Note(E4, QUARTER)])),
      undefined,
    );
  });

  it("counts what is left, in the singular and the plural", () => {
    const one = melodyOf([new Note(C4, QUARTER), new UnpitchedNote(QUARTER)]);
    assert.match(checkProblem(one)!, /^1 note /);

    const two = melodyOf([new UnpitchedNote(QUARTER), new UnpitchedNote(QUARTER)]);
    assert.match(checkProblem(two)!, /^2 notes /);
  });

  it("counts a tied run of blanks once, as the note it is", () => {
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new UnpitchedNote(QUARTER),
      new UnpitchedNote(QUARTER),
    ]);
    melody.tie(1);

    assert.match(checkProblem(melody)!, /^1 note /);
  });
});

describe("marksOf()", () => {
  const solved = () =>
    melodyOf([
      new Note(C4, QUARTER),
      new Note(E4, QUARTER),
      new Note(G4, QUARTER),
    ]);

  const checked = (melody: Melody, right: readonly number[]) =>
    verdictsOf(
      attemptOf(melody),
      [...attemptOf(melody).keys()].map((index) => ({
        index,
        correct: right.includes(index),
      })),
    );

  it("marks the given note found from the start, with no check behind it", () => {
    const marks = marksOf(solved(), new Map(), new Set([0]));

    assert.deepEqual([...marks.correct], [0]);
    assert.deepEqual([...marks.locked], [0]);
    assert.equal(marks.wrong.size, 0);
  });

  it("splits a check into what was found and what was not", () => {
    const melody = solved();
    const marks = marksOf(melody, checked(melody, [0, 1]), new Set([0]));

    assert.deepEqual([...marks.correct].sort(), [0, 1]);
    assert.deepEqual([...marks.wrong], [2]);
  });

  it("locks what was found and nothing else", () => {
    const melody = solved();
    const marks = marksOf(melody, checked(melody, [0, 1]), new Set([0]));

    assert.deepEqual([...marks.locked].sort(), [0, 1]);
  });

  it("paints a verdict across every head of the tied run it judged", () => {
    // The check grades a run once, by its head. The stave draws four
    // noteheads, and all four are the one sound that was judged.
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(E4, QUARTER),
    ]);
    melody.tie(0);
    melody.tie(1);

    const marks = marksOf(melody, checked(melody, [0]), NONE);

    assert.deepEqual([...marks.correct].sort(), [0, 1, 2]);
    assert.deepEqual([...marks.wrong], [3]);
  });

  it("drops a verdict the moment its note is written over", () => {
    // The colour is a claim about a pitch, not about a notehead. Once the
    // pitch has changed the claim is about something that is no longer there,
    // and an amber head would be saying so about a guess nobody has judged.
    const melody = solved();
    const verdicts = checked(melody, [0, 1]);

    melody.setPitch(2, C4);
    const marks = marksOf(melody, verdicts, new Set([0]));

    assert.equal(marks.wrong.size, 0);
    assert.deepEqual([...marks.correct].sort(), [0, 1]);
  });

  it("brings the verdict back when the checked pitch is written again", () => {
    // Undo restores a melody, not a verdict. Keying by value is what makes
    // undoing back to a judged guess show what it was judged to be, without
    // anything having to know an undo happened.
    const melody = solved();
    const verdicts = checked(melody, [0, 1]);

    melody.setPitch(2, C4);
    assert.equal(marksOf(melody, verdicts, NONE).wrong.size, 0);

    melody.setPitch(2, G4);
    assert.deepEqual([...marksOf(melody, verdicts, NONE).wrong], [2]);
  });

  it("drops a verdict when its note has its pitch taken off entirely", () => {
    const melody = solved();
    const verdicts = checked(melody, [0, 1]);

    melody.clearPitch(1);
    const marks = marksOf(melody, verdicts, NONE);

    assert.deepEqual([...marks.correct], [0]);
  });

  it("keeps the given note found even where a check disagreed", () => {
    // Nothing can disagree: the given note is the answer's own. This stands
    // against the sets being unioned in the wrong order.
    const melody = solved();
    const marks = marksOf(melody, checked(melody, []), new Set([0]));

    assert.equal(marks.correct.has(0), true);
    assert.equal(marks.wrong.has(0), false);
    assert.equal(marks.locked.has(0), true);
  });
});

describe("attemptsLabel()", () => {
  it("says nothing before the first check", () => {
    // A fresh puzzle should not open boasting about a count of zero.
    assert.equal(attemptsLabel(0, false), undefined);
  });

  it("counts attempts as they are made, singular and plural", () => {
    assert.equal(attemptsLabel(1, false), "1 attempt");
    assert.equal(attemptsLabel(3, false), "3 attempts");
  });

  it("calls a puzzle solved on the first check flawless", () => {
    // Solving takes at least one check, so one is the perfect score and there
    // is no such thing as solving in zero.
    assert.equal(attemptsLabel(1, true), "Flawless!");
  });

  it("reports the count for a puzzle that took more than one", () => {
    assert.equal(attemptsLabel(4, true), "4 attempts");
  });
});

describe("remembering every verdict a note has had", () => {
  const CS4 = new Pitch("C", 1, 4);

  const oneNote = (pitch: Pitch) => melodyOf([new Note(pitch, QUARTER)]);

  /** One check of a one-note melody, answered as `correct`. */
  const checkOf = (melody: Melody, correct: boolean) =>
    verdictsOf(attemptOf(melody), [{ index: 0, correct }]);

  it("keeps a verdict about a pitch the note no longer holds", () => {
    // Told "not C♯", then told "not C♮". Both are still true of the pitches
    // they were about, and a check is not undone by being followed.
    const melody = oneNote(CS4);
    let known = checkOf(melody, false);

    melody.setPitch(0, C4);
    known = rememberVerdicts(known, checkOf(melody, false));

    // Back to the first guess, without a third check.
    melody.setPitch(0, CS4);
    assert.deepEqual([...marksOf(melody, known, NONE).wrong], [0]);
  });

  it("still marks the second guess, which is the one just judged", () => {
    const melody = oneNote(CS4);
    let known = checkOf(melody, false);
    melody.setPitch(0, C4);
    known = rememberVerdicts(known, checkOf(melody, false));

    assert.deepEqual([...marksOf(melody, known, NONE).wrong], [0]);
  });

  it("says nothing about a pitch nobody has judged", () => {
    const melody = oneNote(CS4);
    const known = checkOf(melody, false);

    melody.setPitch(0, E4);
    const marks = marksOf(melody, known, NONE);
    assert.equal(marks.wrong.size, 0);
    assert.equal(marks.correct.size, 0);
  });

  it("lets a later check overrule an earlier one about the same pitch", () => {
    // Not a case the server can produce — an answer does not move — but the
    // last word should win rather than the first, whatever produced it.
    const melody = oneNote(C4);
    let known = checkOf(melody, false);
    known = rememberVerdicts(known, checkOf(melody, true));

    assert.deepEqual([...marksOf(melody, known, NONE).correct], [0]);
    assert.equal(marksOf(melody, known, NONE).wrong.size, 0);
  });
});

describe("carrying verdicts across a reload", () => {
  const CS4 = new Pitch("C", 1, 4);

  it("writes out every judged pitch, and reads them all back", () => {
    const melody = melodyOf([new Note(CS4, QUARTER), new Note(E4, QUARTER)]);
    let known = verdictsOf(attemptOf(melody), [
      { index: 0, correct: false },
      { index: 1, correct: true },
    ]);
    melody.setPitch(0, C4);
    known = rememberVerdicts(
      known,
      verdictsOf(attemptOf(melody), [{ index: 0, correct: false }]),
    );

    const stored = judgedOf(known);
    assert.deepEqual(
      [...stored].sort((a, b) => a.index - b.index || a.midi - b.midi),
      [
        { index: 0, midi: C4.toMidi(), correct: false },
        { index: 0, midi: CS4.toMidi(), correct: false },
        { index: 1, midi: E4.toMidi(), correct: true },
      ],
    );

    // What comes back has to paint the same stave, including the guess that
    // was judged two checks ago.
    const reloaded = verdictsFrom(stored);
    melody.setPitch(0, CS4);
    const marks = marksOf(melody, reloaded, NONE);
    assert.deepEqual([...marks.wrong], [0]);
    assert.deepEqual([...marks.correct], [1]);
    assert.deepEqual([...marks.locked], [1]);
  });

  it("reads back nothing from nothing", () => {
    assert.equal(judgedOf(new Map()).length, 0);
    assert.equal(verdictsFrom([]).size, 0);
  });
});
