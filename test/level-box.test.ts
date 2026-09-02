import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayProgress } from "../dist/puzzle/progress.js";
import type { UserSummary } from "../dist/shared/session.js";
import type { TranscriptionSummary } from "../dist/shared/transcription.js";
import { levelBoxPlan, maySpeak } from "../dist/ui/level-box.js";

/** Four minutes and twelve seconds, which `formatElapsed` prints as 4:12. */
const SPENT = 252_000;

const progress = (over: Partial<PlayProgress> = {}): PlayProgress => ({
  levelId: "k3m9x2p7qw4t",
  elapsedMs: SPENT,
  checkCount: 0,
  solvedAt: undefined,
  pitches: [],
  judged: [],
  ...over,
});

const started = progress({ pitches: [{ index: 1, midi: 64 }] });
const solved = progress({
  pitches: [{ index: 1, midi: 64 }],
  checkCount: 3,
  solvedAt: 1_754_500_000_000,
});
const flawless = progress({ ...solved, checkCount: 1 });

/** The catalog's box, opened on a tune nobody has touched. */
const plan = (over: Partial<Parameters<typeof levelBoxPlan>[0]> = {}) =>
  levelBoxPlan({
    page: "tunes",
    opening: "browse",
    own: false,
    maySpeak: false,
    progress: undefined,
    ...over,
  });

describe("levelBoxPlan()", () => {
  it("gives the catalog's box a way back and a way in", () => {
    assert.deepEqual(plan().buttons, [
      { label: "Close", act: "close", accent: false },
      { label: "Start Transcribing! →", act: "play", accent: true },
    ]);
  });

  it("names the way in for how far the viewer has got", () => {
    const label = (record: PlayProgress | undefined) =>
      plan({ progress: record }).buttons.at(-1)?.label;
    assert.equal(label(undefined), "Start Transcribing! →");
    assert.equal(label(progress()), "Start Transcribing! →");
    assert.equal(label(started), "Continue Transcribing! →");
    assert.equal(label(solved), "View Transcription");
  });

  it("closes rather than travels, from either list", () => {
    for (const page of ["tunes", "mine"] as const) {
      assert.deepEqual(plan({ page }).buttons[0], {
        label: "Close",
        act: "close",
        accent: false,
      });
    }
  });

  it("puts Edit Details between the two for the owner of a listed tune", () => {
    assert.deepEqual(plan({ own: true }).buttons, [
      { label: "Close", act: "close", accent: false },
      { label: "Edit Details", act: "edit", accent: false },
      { label: "Start Transcribing! →", act: "play", accent: true },
    ]);
  });

  it("offers the owner no Edit Details from inside the puzzle", () => {
    const buttons = plan({ page: "play", opening: "arrival", own: true }).buttons;
    assert.deepEqual(
      buttons.map((button) => button.label),
      ["Back to Public Tunes", "Start Transcribing! →"],
    );
  });

  it("leaves the puzzle page rather than the box, and closes rather than replaying it", () => {
    assert.deepEqual(plan({ page: "play", opening: "arrival", progress: started }).buttons, [
      { label: "Back to Public Tunes", act: "catalog", accent: false },
      { label: "Continue Transcribing! →", act: "close", accent: true },
    ]);
  });

  it("gives the info box one way out and nothing to decide", () => {
    const info = plan({ page: "play", opening: "info", own: true, progress: started });
    assert.deepEqual(info.buttons, [{ label: "Close", act: "close", accent: true }]);
    assert.equal(info.editDetails, false);
  });

  it("offers Stay or the catalog on the solve, with the way out in the accent", () => {
    assert.deepEqual(
      plan({ page: "play", opening: "solving", progress: solved }).buttons,
      [
        { label: "Stay", act: "close", accent: false },
        { label: "Back to Public Tunes", act: "catalog", accent: true },
      ],
    );
  });

  it("says nothing above the buttons about a tune nobody has started", () => {
    assert.equal(plan().line, undefined);
    assert.equal(plan({ progress: progress() }).line, undefined);
  });

  it("says how long an unfinished attempt has taken so far", () => {
    assert.deepEqual(plan({ progress: started }).line, [
      "This tune is in progress! You have transcribed for 4:12 so far.",
    ]);
  });

  it("counts the attempts a solve took", () => {
    assert.deepEqual(plan({ progress: solved }).line, [
      "You transcribed this tune in 4:12 using 3 attempts!",
    ]);
  });

  it("marks a solve in one attempt as flawless, for the accent to pick out", () => {
    assert.deepEqual(plan({ progress: flawless }).line, [
      "You transcribed this tune ",
      { marked: "flawlessly" },
      " in 4:12!",
    ]);
  });

  it("congratulates only the solve that just happened", () => {
    assert.deepEqual(
      plan({ page: "play", opening: "solving", progress: solved }).line,
      ["Congratulations! You transcribed this tune in 4:12 using 3 attempts!"],
    );
    assert.deepEqual(
      plan({ page: "play", opening: "solving", progress: flawless }).line,
      [
        "Congratulations! You transcribed this tune ",
        { marked: "flawlessly" },
        " in 4:12!",
      ],
    );
  });

  it("draws the solve's own figures where the signature goes, and drops the instructions", () => {
    const solving = plan({ page: "play", opening: "solving", progress: solved });
    assert.equal(solving.left, "result");
    assert.equal(solving.instructions, false);
  });

  it("draws the signature and the instructions every other time", () => {
    for (const each of [plan(), plan({ page: "play", opening: "info", progress: solved })]) {
      assert.equal(each.left, "signature");
      assert.equal(each.instructions, true);
    }
  });

  it("offers the heart and the proposal only to a solver who may speak", () => {
    assert.equal(plan({ progress: solved, maySpeak: true }).speak, true);
    // Solved, but this viewer is signed out or keeps their play to themselves.
    assert.equal(plan({ progress: solved, maySpeak: false }).speak, false);
    // May speak, but has not solved it: the server would refuse both.
    assert.equal(plan({ progress: started, maySpeak: true }).speak, false);
  });

  it("says the tune is the viewer's own in place of the byline", () => {
    assert.equal(plan({ own: true }).byline, "own");
    assert.equal(plan().byline, "author");
  });
});

/** A published tune belonging to somebody else. */
const level = (over: Partial<TranscriptionSummary> = {}): TranscriptionSummary =>
  ({
    id: "k3m9x2p7qw4t",
    ownerId: "7k2m9x4p3qwt",
    status: "published",
    ...over,
  }) as TranscriptionSummary;

const viewer = (over: Partial<UserSummary> = {}): UserSummary =>
  ({ id: "q4w7m2x9p3kt", shareStats: true, isAdmin: false, ...over }) as UserSummary;

describe("maySpeak()", () => {
  it("lets a sharing solver speak about somebody else's published tune", () => {
    assert.equal(maySpeak(level(), viewer(), true), true);
  });

  it("refuses everybody the server would refuse", () => {
    // Signed out; keeping their play out of the figures; not solved yet; the
    // author, whose word is the anchor the proposals lean on; a draft.
    assert.equal(maySpeak(level(), undefined, true), false);
    assert.equal(maySpeak(level(), viewer({ shareStats: false }), true), false);
    assert.equal(maySpeak(level(), viewer(), false), false);
    assert.equal(maySpeak(level({ ownerId: "q4w7m2x9p3kt" }), viewer(), true), false);
    assert.equal(maySpeak(level({ status: "draft" }), viewer(), true), false);
  });
});
