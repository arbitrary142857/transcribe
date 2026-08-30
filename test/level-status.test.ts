import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayProgress } from "../dist/puzzle/progress.js";
import { playStatus, workStatus } from "../dist/ui/level-status.js";

const record = (over: Partial<PlayProgress> = {}): PlayProgress => ({
  levelId: "k3m9x2p7qw4t",
  elapsedMs: 1000,
  checkCount: 0,
  solvedAt: undefined,
  pitches: [],
  judged: [],
  ...over,
});

describe("playStatus()", () => {
  it("says a level nobody has written a note on has not been started", () => {
    assert.deepEqual(playStatus(undefined), { text: "Not Started", tone: "none" });
    // The clock having run is not having started: opening a level and closing
    // it again writes a record with nothing on the stave.
    assert.deepEqual(playStatus(record({ elapsedMs: 90_000 })), {
      text: "Not Started",
      tone: "none",
    });
  });

  it("says a level with pitches on it is in progress", () => {
    assert.deepEqual(playStatus(record({ pitches: [{ index: 1, midi: 64 }] })), {
      text: "In Progress",
      tone: "doing",
    });
  });

  it("says a solved level is transcribed", () => {
    assert.deepEqual(playStatus(record({ solvedAt: 1 })), {
      text: "Transcribed",
      tone: "done",
    });
  });
});

describe("workStatus()", () => {
  it("says a draft still missing pitches is unfinished, and says it quietly", () => {
    // The plain state of work in hand: no colour of its own, where being
    // published is the thing worth marking.
    assert.deepEqual(workStatus({ status: "draft", unpitchedCount: 3 }), {
      text: "Unfinished",
      tone: "none",
    });
  });

  it("says a draft with every note pitched is complete", () => {
    assert.deepEqual(workStatus({ status: "draft", unpitchedCount: 0 }), {
      text: "Complete",
      tone: "done",
    });
  });

  it("says a published level is published, which is the bigger fact", () => {
    assert.deepEqual(workStatus({ status: "published", unpitchedCount: 0 }), {
      text: "Published",
      tone: "live",
    });
  });
});
