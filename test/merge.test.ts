import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent, Rest } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { mergeProgress, regradeProgress } from "../dist/puzzle/merge.js";
import type { PlayProgress } from "../dist/puzzle/progress.js";

const C4 = new Pitch("C", 0, 4);
const E4 = new Pitch("E", 0, 4);
const G4 = new Pitch("G", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const C_MAJOR = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;

const melodyOf = (events: readonly NoteEvent[]) =>
  new Melody(C_MAJOR, METER_4_4, events);

/** C E G E: four notes to find, at 60, 64, 67, 64. */
const ANSWER = melodyOf([
  new Note(C4, QUARTER),
  new Note(E4, QUARTER),
  new Note(G4, QUARTER),
  new Note(E4, QUARTER),
]);

const LEVEL = "k3m9x2p7qw4t";

const right = [
  { index: 0, midi: 60 },
  { index: 1, midi: 64 },
  { index: 2, midi: 67 },
  { index: 3, midi: 64 },
];

const rightJudged = right.map((pitch) => ({ ...pitch, correct: true }));

const record = (over: Partial<PlayProgress> = {}): PlayProgress => ({
  levelId: LEVEL,
  elapsedMs: 1000,
  checkCount: 1,
  solvedAt: undefined,
  assisted: false,
  pitches: [],
  judged: [],
  ...over,
});

const solved = (over: Partial<PlayProgress> = {}): PlayProgress =>
  record({
    elapsedMs: 60_000,
    checkCount: 2,
    solvedAt: 1_754_500_000_000,
    pitches: right,
    judged: rightJudged,
    ...over,
  });

describe("regradeProgress()", () => {
  it("recomputes every verdict from the answer rather than believing the record", () => {
    const { progress } = regradeProgress(
      ANSWER,
      record({
        judged: [
          { index: 1, midi: 64, correct: false },
          { index: 2, midi: 60, correct: true },
        ],
      }),
    );

    assert.deepEqual(progress.judged, [
      { index: 1, midi: 64, correct: true },
      { index: 2, midi: 60, correct: false },
    ]);
  });

  it("drops pitches and verdicts at indices that are rests, tails of ties, or past the end", () => {
    const withRest = melodyOf([
      new Note(C4, QUARTER),
      new Rest(QUARTER),
      new Note(E4, QUARTER),
      new Note(E4, QUARTER),
    ]);
    withRest.tie(2);

    const { progress, correct } = regradeProgress(
      withRest,
      record({
        pitches: [
          { index: 0, midi: 60 },
          { index: 1, midi: 60 },
          { index: 2, midi: 64 },
          { index: 3, midi: 64 },
          { index: 9, midi: 64 },
        ],
        judged: [
          { index: 1, midi: 60, correct: true },
          { index: 3, midi: 64, correct: true },
          { index: 9, midi: 64, correct: true },
          { index: 2, midi: 64, correct: false },
        ],
      }),
    );

    assert.deepEqual(progress.pitches, [
      { index: 0, midi: 60 },
      { index: 2, midi: 64 },
    ]);
    assert.deepEqual(progress.judged, [{ index: 2, midi: 64, correct: true }]);
    assert.equal(correct, 2);
  });

  it("keeps a solve only when every note is written and right", () => {
    const earned = regradeProgress(ANSWER, solved());
    assert.equal(earned.progress.solvedAt, 1_754_500_000_000);
    assert.equal(earned.correct, 4);

    const oneWrong = regradeProgress(
      ANSWER,
      solved({ pitches: [...right.slice(0, 3), { index: 3, midi: 65 }] }),
    );
    assert.equal(oneWrong.progress.solvedAt, undefined);
    assert.equal(oneWrong.correct, 3);

    const oneMissing = regradeProgress(ANSWER, solved({ pitches: right.slice(0, 3) }));
    assert.equal(oneMissing.progress.solvedAt, undefined);
  });

  it("takes the solve off a record whose pitches do not earn it, and keeps the rest", () => {
    const { progress } = regradeProgress(
      ANSWER,
      solved({ pitches: [...right.slice(0, 3), { index: 3, midi: 65 }], checkCount: 7 }),
    );

    assert.equal(progress.solvedAt, undefined);
    assert.equal(progress.checkCount, 7);
    assert.equal(progress.elapsedMs, 60_000);
    assert.deepEqual(progress.pitches, [...right.slice(0, 3), { index: 3, midi: 65 }]);
  });

  it("never calls a record solved that did not claim to be", () => {
    // Every pitch right, but nobody ever asked: a solve is a check that came
    // back all correct, and this one never came back at all.
    const { progress, correct } = regradeProgress(
      ANSWER,
      record({ pitches: right, checkCount: 0 }),
    );

    assert.equal(correct, 4);
    assert.equal(progress.solvedAt, undefined);
    assert.equal(progress.checkCount, 0);
  });

  it("counts a solve as at least one check, and floors the clock and the count to whole numbers", () => {
    const { progress } = regradeProgress(
      ANSWER,
      solved({ checkCount: 0, elapsedMs: 1234.56, solvedAt: 1_754_500_000_000.7 }),
    );

    assert.equal(progress.checkCount, 1);
    assert.equal(progress.elapsedMs, 1234);
    assert.equal(progress.solvedAt, 1_754_500_000_000);

    const partial = regradeProgress(ANSWER, record({ checkCount: 2.9, elapsedMs: 0.4 }));
    assert.equal(partial.progress.checkCount, 2);
    assert.equal(partial.progress.elapsedMs, 0);
  });

  it("adds a correct verdict for every pitch of a solved record, since a solve is a check", () => {
    const { progress } = regradeProgress(
      ANSWER,
      solved({ judged: [{ index: 1, midi: 62, correct: false }] }),
    );

    assert.deepEqual(progress.judged, [
      { index: 0, midi: 60, correct: true },
      { index: 1, midi: 62, correct: false },
      { index: 1, midi: 64, correct: true },
      { index: 2, midi: 67, correct: true },
      { index: 3, midi: 64, correct: true },
    ]);
  });

  it("orders pitches and verdicts the same way every time, so two records of the same work read equal", () => {
    const shuffled = record({
      pitches: [{ index: 2, midi: 67 }, { index: 0, midi: 60 }, { index: 0, midi: 61 }],
      judged: [
        { index: 2, midi: 67, correct: true },
        { index: 0, midi: 61, correct: false },
        { index: 0, midi: 60, correct: true },
        { index: 0, midi: 60, correct: true },
      ],
    });
    const ordered = record({
      pitches: [{ index: 0, midi: 61 }, { index: 2, midi: 67 }],
      judged: [
        { index: 0, midi: 60, correct: true },
        { index: 0, midi: 61, correct: false },
        { index: 2, midi: 67, correct: true },
      ],
    });

    // The last word on an index wins, the way a page would have written it.
    assert.deepEqual(
      regradeProgress(ANSWER, shuffled).progress,
      regradeProgress(ANSWER, ordered).progress,
    );
  });

  it("counts how many pitches are right", () => {
    assert.equal(regradeProgress(ANSWER, record()).correct, 0);
    assert.equal(
      regradeProgress(ANSWER, record({ pitches: [{ index: 0, midi: 60 }, { index: 1, midi: 65 }] })).correct,
      1,
    );
    assert.equal(regradeProgress(ANSWER, record({ pitches: right })).correct, 4);
  });
});

describe("mergeProgress()", () => {
  const twoRight = record({ pitches: right.slice(0, 2), elapsedMs: 500, checkCount: 3 });
  const threeRight = record({ pitches: right.slice(0, 3), elapsedMs: 200, checkCount: 1 });

  it("takes the browser's record whole when the account has none", () => {
    const merged = mergeProgress(ANSWER, undefined, solved({ judged: [] }));

    assert.deepEqual(merged, solved({ judged: rightJudged }));
  });

  it("prefers a solved record to a partial one, whichever side holds it", () => {
    const quick = solved({ checkCount: 9, elapsedMs: 90_000 });

    const accountSolved = mergeProgress(ANSWER, quick, threeRight);
    assert.equal(accountSolved.solvedAt, quick.solvedAt);
    assert.equal(accountSolved.checkCount, 9);
    assert.equal(accountSolved.elapsedMs, 90_000);

    const browserSolved = mergeProgress(ANSWER, threeRight, quick);
    assert.equal(browserSolved.solvedAt, quick.solvedAt);
    assert.equal(browserSolved.checkCount, 9);
    assert.equal(browserSolved.elapsedMs, 90_000);
  });

  it("between two solves takes the fewer checks, then the shorter clock, then the account's", () => {
    const fewer = solved({ checkCount: 2, elapsedMs: 80_000, solvedAt: 1 });
    const more = solved({ checkCount: 5, elapsedMs: 10_000, solvedAt: 2 });
    assert.equal(mergeProgress(ANSWER, more, fewer).solvedAt, 1);
    assert.equal(mergeProgress(ANSWER, fewer, more).solvedAt, 1);

    const slower = solved({ checkCount: 2, elapsedMs: 90_000, solvedAt: 3 });
    assert.equal(mergeProgress(ANSWER, slower, fewer).solvedAt, 1);
    assert.equal(mergeProgress(ANSWER, fewer, slower).solvedAt, 1);

    const same = solved({ checkCount: 2, elapsedMs: 80_000, solvedAt: 4 });
    assert.equal(mergeProgress(ANSWER, same, fewer).solvedAt, 4);
  });

  it("between two partials takes the more correct pitches, then the more written, then the account's", () => {
    assert.equal(mergeProgress(ANSWER, twoRight, threeRight).checkCount, 1);
    assert.equal(mergeProgress(ANSWER, threeRight, twoRight).checkCount, 1);

    // Two right pitches and a wrong one written beats two right alone.
    const twoRightOneWrong = record({
      pitches: [...right.slice(0, 2), { index: 2, midi: 61 }],
      elapsedMs: 700,
      checkCount: 6,
    });
    assert.equal(mergeProgress(ANSWER, twoRight, twoRightOneWrong).checkCount, 6);
    assert.equal(mergeProgress(ANSWER, twoRightOneWrong, twoRight).checkCount, 6);

    // The same work on both sides: the account's stands.
    const twin = record({ pitches: right.slice(0, 2), elapsedMs: 999, checkCount: 8 });
    assert.equal(mergeProgress(ANSWER, twin, twoRight).checkCount, 8);
  });

  it("never mixes one side's clock with the other's count", () => {
    const merged = mergeProgress(
      ANSWER,
      solved({ checkCount: 2, elapsedMs: 80_000, solvedAt: 1 }),
      solved({ checkCount: 5, elapsedMs: 10_000, solvedAt: 2 }),
    );

    assert.equal(merged.checkCount, 2);
    assert.equal(merged.elapsedMs, 80_000);
    assert.equal(merged.solvedAt, 1);
  });

  it("keeps every verdict from both sides, keyed by note and pitch", () => {
    const merged = mergeProgress(
      ANSWER,
      record({ judged: [{ index: 1, midi: 62, correct: false }] }),
      record({
        pitches: [{ index: 0, midi: 60 }],
        judged: [
          { index: 1, midi: 62, correct: false },
          { index: 1, midi: 63, correct: false },
        ],
      }),
    );

    assert.deepEqual(merged.judged, [
      { index: 1, midi: 62, correct: false },
      { index: 1, midi: 63, correct: false },
    ]);
    assert.deepEqual(merged.pitches, [{ index: 0, midi: 60 }]);
  });

  it("changes nothing when handed the same record twice", () => {
    const once = mergeProgress(ANSWER, undefined, threeRight);
    const twice = mergeProgress(ANSWER, once, threeRight);
    assert.deepEqual(twice, once);

    const solvedOnce = mergeProgress(ANSWER, undefined, solved());
    assert.deepEqual(mergeProgress(ANSWER, solvedOnce, solved()), solvedOnce);
  });
});

describe("the assist mark, across a merge", () => {
  const assisted = (over: Partial<PlayProgress> = {}) =>
    record({ assisted: true, ...over });

  it("survives from the browser onto an account that has never seen the tune", () => {
    assert.equal(mergeProgress(ANSWER, undefined, assisted()).assisted, true);
  });

  it("is kept from whichever side holds it, winner or loser", () => {
    // The mark is a fact about the tools, not half of a score, so it does not
    // travel with the pitches and the clock the way the rest of a record does.
    const browserWins = mergeProgress(ANSWER, assisted(), solved());
    const accountWins = mergeProgress(ANSWER, solved(), assisted());

    assert.equal(browserWins.assisted, true);
    assert.equal(accountWins.assisted, true);
  });

  it("cannot be taken back by a browser that says it was never asked for", () => {
    // Which is the whole of "once activated, it cannot be deactivated" on this
    // side of the wire: local storage is the player's own to edit, and a
    // record claiming no assist meets an account row that remembers it.
    assert.equal(mergeProgress(ANSWER, assisted(), record()).assisted, true);
  });

  it("stays off when neither side ever asked for the tools", () => {
    assert.equal(mergeProgress(ANSWER, record(), solved()).assisted, false);
  });

  it("is believed from a browser, since claiming it only costs the claimant", () => {
    // An assisted solve is left out of the public medians. Nothing is gained
    // by claiming one, so nothing is regraded about it.
    assert.equal(regradeProgress(ANSWER, assisted()).progress.assisted, true);
  });

  it("changes nothing when the same record is offered twice", () => {
    const once = mergeProgress(ANSWER, undefined, assisted({ pitches: right }));
    const twice = mergeProgress(ANSWER, once, assisted({ pitches: right }));

    assert.deepEqual(twice, once);
  });
});
