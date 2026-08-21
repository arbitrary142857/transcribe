/**
 * Two records of one level, made into one.
 *
 * A browser holds progress for whoever used it, and an account holds progress
 * for whoever signed in; the day those are the same person, the browser's
 * record is offered to the account and the two have to be reconciled. This is
 * the rule, written down once, for the route that does it and for
 * docs/progress.md, which says the same thing in a table.
 *
 * The rule in one sentence: **one record wins whole, and the other gives only
 * its verdicts.** A score is a pair -- these checks, in this time -- and
 * taking the fewer checks from one solve and the shorter clock from another
 * would describe a sitting nobody had. So the winner's pitches, count, clock
 * and solve travel together, and the loser contributes the one thing that is
 * a fact rather than a score: what each of its guesses was told.
 *
 * Who wins: a solve over an attempt, whichever side holds it; between two
 * solves the fewer checks, then the shorter clock; between two attempts the
 * more notes found, then the more written; and on a tie the account's, which
 * is what makes merging the same record twice change nothing.
 *
 * Before any of that, a browser's record is held against the answer. Local
 * storage is the player's own to edit, so a claimed solve is kept only when
 * every pitch earns it, and every verdict is recomputed rather than believed.
 * Nothing this file does touches the DOM or the Workers runtime; it is the
 * Worker that calls it.
 */

import type { Melody } from "../music/melody.js";
import { gradeAttempt } from "../shared/transcription.js";
import type { PlayProgress } from "./progress.js";
import {
  attemptOf,
  judgedOf,
  rememberVerdicts,
  verdictsFrom,
  type Judged,
} from "./verdicts.js";

/** A record held against the answer: what survives, and how much of it is right. */
export type Regraded = { progress: PlayProgress; correct: number };

const byIndex = (a: { index: number }, b: { index: number }) => a.index - b.index;

const byIndexThenMidi = (a: Judged, b: Judged) =>
  a.index - b.index || a.midi - b.midi;

/**
 * The record as the answer would have it.
 *
 * `attemptOf(answer)` is the page's way of reading the pitches off a melody,
 * and on the answer -- every note pitched -- it is exactly the key: each
 * sounding head and the MIDI number that belongs there. Nothing else in the
 * record is trusted against it. A pitch at an index the key does not name (a
 * rest, the tail of a tied run, past the end) is dropped; so is a verdict
 * there. Every surviving verdict is recomputed. A solve is kept only when the
 * record claimed one AND every note is written and right -- a full set of
 * right pitches nobody ever checked is still unchecked -- and a kept solve
 * adds a correct verdict for every pitch, since a solve is a check that said
 * so about each of them (the play page assumes the same when it reopens one).
 *
 * The result is in a fixed order, pitches by index and verdicts by index then
 * pitch, so that two records of the same work compare equal as strings.
 */
export function regradeProgress(answer: Melody, record: PlayProgress): Regraded {
  const key = attemptOf(answer);

  // The last word on an index wins, which is how a page would have written it.
  const pitchAt = new Map<number, number>();
  for (const { index, midi } of record.pitches) {
    if (key.has(index)) pitchAt.set(index, midi);
  }
  const pitches = [...pitchAt]
    .map(([index, midi]) => ({ index, midi }))
    .sort(byIndex);

  const graded = gradeAttempt(answer, pitchAt);
  const solved =
    record.solvedAt !== undefined && graded.correct === graded.total;

  const claims = new Map<string, Judged>();
  const claim = (index: number, midi: number) => {
    claims.set(`${index}:${midi}`, { index, midi, correct: key.get(index) === midi });
  };
  for (const { index, midi } of record.judged) {
    if (key.has(index)) claim(index, midi);
  }
  if (solved) {
    for (const { index, midi } of pitches) claim(index, midi);
  }
  const judged = [...claims.values()].sort(byIndexThenMidi);

  const whole = (value: number) => Math.max(0, Math.floor(value));

  return {
    progress: {
      levelId: record.levelId,
      elapsedMs: whole(record.elapsedMs),
      checkCount: Math.max(solved ? 1 : 0, whole(record.checkCount)),
      solvedAt: solved ? whole(record.solvedAt!) : undefined,
      pitches,
      judged,
    },
    correct: graded.correct,
  };
}

/**
 * Whether the first beats the second, by the rule in the header.
 *
 * Strictly: a tie is not a win, and the caller gives the tie to the account.
 */
function beats(a: Regraded, b: Regraded): boolean {
  const aSolved = a.progress.solvedAt !== undefined;
  const bSolved = b.progress.solvedAt !== undefined;
  if (aSolved !== bSolved) return aSolved;

  if (aSolved) {
    if (a.progress.checkCount !== b.progress.checkCount) {
      return a.progress.checkCount < b.progress.checkCount;
    }
    return a.progress.elapsedMs < b.progress.elapsedMs;
  }

  if (a.correct !== b.correct) return a.correct > b.correct;
  return a.progress.pitches.length > b.progress.pitches.length;
}

/**
 * The account's record after the browser's has been offered to it.
 *
 * Both sides are regraded -- the account's row is trusted, and regrading an
 * honest row changes nothing, but it is the only way to count its right
 * pitches by the same reckoning. The winner's verdicts are passed to
 * `rememberVerdicts` second: after regrading the two sides cannot disagree
 * about a guess, but "the winner's word last" is the rule that needs nothing
 * to be true, and the argument order is where it lives.
 */
export function mergeProgress(
  answer: Melody,
  account: PlayProgress | undefined,
  browser: PlayProgress,
): PlayProgress {
  const offered = regradeProgress(answer, browser);
  if (account === undefined) return offered.progress;

  const held = regradeProgress(answer, account);
  const [winner, loser] = beats(offered, held) ? [offered, held] : [held, offered];

  const judged = judgedOf(
    rememberVerdicts(
      verdictsFrom(loser.progress.judged),
      verdictsFrom(winner.progress.judged),
    ),
  ).sort(byIndexThenMidi);

  return { ...winner.progress, judged };
}
