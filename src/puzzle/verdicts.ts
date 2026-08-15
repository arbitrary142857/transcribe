/**
 * What every check has said, and what the stave should therefore show.
 *
 * The idea holding this file together: **a verdict is a claim about a pitch,
 * not about a notehead.** It is recorded against the MIDI value that was
 * submitted, and it is shown only while the note still holds that value.
 *
 * That one rule answers every awkward case without a case for any of them.
 * Re-pitch a note marked wrong and the amber drops, because the claim was
 * about the guess that is gone. Undo back to it and the amber returns, because
 * it is the same guess again — and nothing here has to know that an undo
 * happened, or that undo exists.
 *
 * Every guess is remembered, not only the last. Told a note is not C♯ and then
 * that it is not C♮, both remain true: neither check is undone by the other, so
 * typing C♯ again shows amber without having to ask a third time. Only wrong
 * guesses can pile up — a note judged right is locked and can have no second
 * verdict — so the memory is bounded by how many wrong answers somebody cared
 * to try.
 */

import type { Melody } from "../music/melody.js";
import { Note, Rest } from "../music/note-event.js";
import { countUnpitchedNotes } from "../shared/transcription.js";

/** What every judged pitch of one note came back as, keyed by MIDI value. */
export type NoteVerdicts = ReadonlyMap<number, boolean>;

/** Judged guesses, keyed by the head of each tied run, as the route keys them. */
export type Verdicts = ReadonlyMap<number, NoteVerdicts>;

/** One judged guess, flattened — the shape a saved attempt stores. */
export type Judged = {
  readonly index: number;
  readonly midi: number;
  readonly correct: boolean;
};

/** How the stave should draw each event. Indices, not heads: see `marksOf`. */
export type Marks = {
  readonly correct: ReadonlySet<number>;
  readonly wrong: ReadonlySet<number>;
  /** Correct, plus the note the puzzle gave away. Nothing here may be edited. */
  readonly locked: ReadonlySet<number>;
};

/**
 * The heads of every sounding note, in order.
 *
 * The same reckoning `countSoundingNotes` uses, and it has to stay that way:
 * this is what decides which indices an attempt names, and the route grades by
 * exactly these.
 */
function* soundingHeads(melody: Melody): Generator<number> {
  for (let index = 0; index < melody.eventCount; index++) {
    if (melody.getEvent(index) instanceof Rest) continue;
    if (melody.isTiedToPrev(index)) continue;
    yield index;
  }
}

/**
 * The pitches now written down, ready to be sent.
 *
 * Notes still awaiting a pitch are left out rather than sent as blanks, which
 * is what makes `attemptOf(melody).size` short of the note count exactly when
 * `checkProblem` has something to say.
 */
export function attemptOf(melody: Melody): Map<number, number> {
  const attempt = new Map<number, number>();
  for (const head of soundingHeads(melody)) {
    const event = melody.getEvent(head);
    if (event instanceof Note) {
      attempt.set(head, event.pitch.toMidi());
    }
  }
  return attempt;
}

/**
 * Why the attempt cannot be checked yet, or nothing if it can.
 *
 * A sentence rather than a flag, in the shape `timingProblem` and
 * `submitProblem` already use: the button greys and this appears beside it.
 *
 * A half-filled score is not something anyone means to send, and refusing it
 * happens to be the cheapest thing standing between the check route and being
 * asked about one note at a time.
 */
export function checkProblem(melody: Melody): string | undefined {
  const left = countUnpitchedNotes(melody);
  if (left === 0) return undefined;
  return left === 1
    ? "1 note still needs a pitch."
    : `${left} notes still need pitches.`;
}

/**
 * What the box beside the clock says about how many checks it took.
 *
 * Nothing at all before the first one: a puzzle just opened has no score yet,
 * and "0 attempts" reads as a boast about having done nothing.
 *
 * Solving takes at least one check — there is no way to be told you are right
 * without asking — so one is the perfect score rather than zero, and it gets a
 * word instead of a number.
 */
export function attemptsLabel(
  checkCount: number,
  solved: boolean,
): string | undefined {
  if (checkCount === 0) return undefined;
  if (solved && checkCount === 1) return "Flawless!";
  return checkCount === 1 ? "1 attempt" : `${checkCount} attempts`;
}

/** What one check answered, held against what was asked. */
export function verdictsOf(
  attempt: ReadonlyMap<number, number>,
  answered: readonly { index: number; correct: boolean }[],
): Verdicts {
  const verdicts = new Map<number, Map<number, boolean>>();
  for (const { index, correct } of answered) {
    const midi = attempt.get(index);
    // A verdict about a note nobody asked about judges nothing, and there is
    // no pitch to hold it against.
    if (midi === undefined) continue;
    verdicts.set(index, new Map([[midi, correct]]));
  }
  return verdicts;
}

/**
 * Everything known before, plus what the latest check said.
 *
 * A guess judged twice takes the newer answer — the server cannot actually
 * change its mind, since the answer does not move, but the last word winning is
 * the only rule that does not need that to be true.
 */
export function rememberVerdicts(known: Verdicts, latest: Verdicts): Verdicts {
  const merged = new Map<number, Map<number, boolean>>();
  for (const [head, judged] of known) {
    merged.set(head, new Map(judged));
  }
  for (const [head, judged] of latest) {
    const note = merged.get(head) ?? new Map<number, boolean>();
    for (const [midi, correct] of judged) {
      note.set(midi, correct);
    }
    merged.set(head, note);
  }
  return merged;
}

/** Flattened for storage, one row per judged guess. */
export function judgedOf(verdicts: Verdicts): Judged[] {
  const rows: Judged[] = [];
  for (const [index, judged] of verdicts) {
    for (const [midi, correct] of judged) {
      rows.push({ index, midi, correct });
    }
  }
  return rows;
}

/** The same, read back — what a reload starts its colouring from. */
export function verdictsFrom(judged: readonly Judged[]): Verdicts {
  const verdicts = new Map<number, Map<number, boolean>>();
  for (const { index, midi, correct } of judged) {
    const note = verdicts.get(index) ?? new Map<number, boolean>();
    note.set(midi, correct);
    verdicts.set(index, note);
  }
  return verdicts;
}

/**
 * How the stave should draw every event, right now.
 *
 * Keyed by event index rather than by head: a check grades a tied run once,
 * and the stave draws it as several noteheads that are all the one sound it
 * judged, so the verdict is spread across the whole run here.
 *
 * `given` is the note the puzzle handed over. It is drawn found and locked
 * from the first moment, with no check behind it — it was never anybody's to
 * find, and it is the answer's own pitch, so nothing can disagree with it.
 */
export function marksOf(
  melody: Melody,
  verdicts: Verdicts,
  given: ReadonlySet<number>,
): Marks {
  const correct = new Set<number>(given);
  const wrong = new Set<number>();

  for (const [head, judged] of verdicts) {
    if (given.has(head)) continue;
    const event = melody.getEvent(head);
    if (!(event instanceof Note)) continue;
    // Every claim was about a pitch, so the note's own pitch is the question
    // asked of them. Nothing has judged what it holds now — rewritten, cleared,
    // or a guess nobody has tried — and there is no mark for it.
    const verdict = judged.get(event.pitch.toMidi());
    if (verdict === undefined) continue;
    for (const index of melody.getTiedGroup(head)) {
      (verdict ? correct : wrong).add(index);
    }
  }

  // Locked is exactly what has been found: the given note and every confirmed
  // one. Wrong notes stay open, which is the whole of the work left.
  return { correct, wrong, locked: correct };
}
