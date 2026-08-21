import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayProgress } from "../dist/puzzle/progress.js";
import {
  FILTERS,
  bucketOf,
  emptyFilterSentence,
  filterLevels,
} from "../dist/ui/level-filter.js";

const record = (over: Partial<PlayProgress> = {}): PlayProgress => ({
  levelId: "k3m9x2p7qw4t",
  elapsedMs: 1000,
  checkCount: 0,
  solvedAt: undefined,
  pitches: [],
  judged: [],
  ...over,
});

describe("bucketOf()", () => {
  it("calls a level with no record unplayed", () => {
    assert.equal(bucketOf(undefined), "unplayed");
  });

  it("calls a record with no pitches unplayed, since nothing was written down", () => {
    // Opening a level and closing it again writes a record with the clock
    // running and nothing on the stave; that is not having started.
    assert.equal(bucketOf(record({ elapsedMs: 40_000 })), "unplayed");
  });

  it("calls a record with pitches and no solve in progress", () => {
    assert.equal(bucketOf(record({ pitches: [{ index: 1, midi: 64 }] })), "started");
  });

  it("calls a solved record solved, whatever else it holds", () => {
    assert.equal(bucketOf(record({ solvedAt: 1 })), "solved");
    assert.equal(bucketOf(record({ solvedAt: 1, pitches: [{ index: 1, midi: 64 }] })), "solved");
  });
});

describe("filterLevels()", () => {
  const showing = [
    { level: { id: "a" }, progress: undefined },
    { level: { id: "b" }, progress: record({ pitches: [{ index: 1, midi: 64 }] }) },
    { level: { id: "c" }, progress: record({ solvedAt: 1 }) },
    { level: { id: "d" }, progress: record() },
  ];
  const ids = (shown: readonly { level: { id: string } }[]) => shown.map((each) => each.level.id);

  it("shows everything under All, in the order it was given", () => {
    assert.deepEqual(ids(filterLevels(showing, "all")), ["a", "b", "c", "d"]);
  });

  it("keeps only the bucket asked for", () => {
    assert.deepEqual(ids(filterLevels(showing, "unplayed")), ["a", "d"]);
    assert.deepEqual(ids(filterLevels(showing, "started")), ["b"]);
    assert.deepEqual(ids(filterLevels(showing, "solved")), ["c"]);
  });
});

describe("emptyFilterSentence()", () => {
  it("says nothing under All, where an empty list is the catalog's to explain", () => {
    assert.equal(emptyFilterSentence("all"), undefined);
  });

  it("names what the filter found nothing of", () => {
    for (const { value } of FILTERS) {
      if (value === "all") continue;
      const sentence = emptyFilterSentence(value);
      assert.equal(typeof sentence, "string");
      assert.match(sentence!, /\.$/);
    }
    assert.match(emptyFilterSentence("solved")!, /solved/i);
    assert.match(emptyFilterSentence("started")!, /progress/i);
  });
});
