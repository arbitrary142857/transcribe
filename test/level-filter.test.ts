import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayProgress } from "../dist/puzzle/progress.js";
import {
  ALL_PLAY_STATUSES,
  ALL_WORK_STATUSES,
  WHOLE_CATALOG,
  WHOLE_SCALE,
  bucketOf,
  catalogEmptySentence,
  filterByHeat,
  filterCatalog,
  filterWork,
  workBucketOf,
  workEmptySentence,
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

const ids = (shown: readonly { level: { id: string } }[]) =>
  shown.map((each) => each.level.id);

/** Nobody signed in, nothing hearted: the view a first visit filters through. */
const VISITOR = { hearted: new Set<string>(), viewerId: undefined };

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

describe("workBucketOf()", () => {
  it("sorts a draft by whether every note has a pitch", () => {
    assert.equal(workBucketOf({ status: "draft", unpitchedCount: 2 }), "unfinished");
    assert.equal(workBucketOf({ status: "draft", unpitchedCount: 0 }), "complete");
  });

  it("calls a published level published, which outranks the rest", () => {
    assert.equal(workBucketOf({ status: "published", unpitchedCount: 0 }), "published");
  });
});

describe("filterCatalog()", () => {
  const showing = [
    { level: { id: "a", ownerId: "them" }, progress: undefined },
    {
      level: { id: "b", ownerId: "them" },
      progress: record({ pitches: [{ index: 1, midi: 64 }] }),
    },
    { level: { id: "c", ownerId: "you" }, progress: record({ solvedAt: 1 }) },
    { level: { id: "d", ownerId: "them" }, progress: record() },
  ];

  it("shows everything when nothing is cut, in the order it was given", () => {
    assert.deepEqual(ids(filterCatalog(showing, WHOLE_CATALOG, VISITOR)), [
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("keeps only the statuses that are on", () => {
    const only = (over: Partial<typeof ALL_PLAY_STATUSES>) =>
      filterCatalog(
        showing,
        { ...WHOLE_CATALOG, statuses: { ...ALL_PLAY_STATUSES, ...over } },
        VISITOR,
      );

    assert.deepEqual(ids(only({ started: false, solved: false })), ["a", "d"]);
    assert.deepEqual(ids(only({ unplayed: false, solved: false })), ["b"]);
    assert.deepEqual(ids(only({ unplayed: false, started: false })), ["c"]);
  });

  it("shows nothing when every status is turned off, rather than everything", () => {
    // "None of them" is a thing somebody can ask for, and the honest answer is
    // an empty list — not the whole catalog because no cut was made.
    const none = { unplayed: false, started: false, solved: false };
    assert.deepEqual(filterCatalog(showing, { ...WHOLE_CATALOG, statuses: none }, VISITOR), []);
  });

  it("keeps only what this viewer has hearted, when that is asked for", () => {
    const view = { hearted: new Set(["b", "d"]), viewerId: "you" };
    assert.deepEqual(
      ids(filterCatalog(showing, { ...WHOLE_CATALOG, heartedOnly: true }, view)),
      ["b", "d"],
    );
  });

  it("drops the viewer's own levels when they ask not to see them", () => {
    const view = { hearted: new Set<string>(), viewerId: "you" };
    assert.deepEqual(
      ids(filterCatalog(showing, { ...WHOLE_CATALOG, showOwn: false }, view)),
      ["a", "b", "d"],
    );
  });

  it("drops nobody's levels for a visitor who is nobody", () => {
    // Signed out there is no "your own", so the cut has nothing to bite on.
    assert.deepEqual(
      ids(filterCatalog(showing, { ...WHOLE_CATALOG, showOwn: false }, VISITOR)),
      ["a", "b", "c", "d"],
    );
  });

  it("ANDs the cuts, so a level has to pass every one of them", () => {
    const view = { hearted: new Set(["b", "c"]), viewerId: "you" };
    assert.deepEqual(
      ids(
        filterCatalog(
          showing,
          { ...WHOLE_CATALOG, heartedOnly: true, showOwn: false },
          view,
        ),
      ),
      ["b"],
    );
  });
});

describe("filterByHeat()", () => {
  // The blended figure is what the range cuts by: the first level's author
  // said 2, but three five-pepper ratings pull the shown figure to 3.5.
  const showing = [
    { level: { id: "a", authorDifficulty: 2, ratingCount: 3, ratingHalves: 30 } },
    { level: { id: "b", authorDifficulty: 2 } },
    { level: { id: "c", authorDifficulty: 5 } },
    { level: { id: "d" } }, // a draft with no figure at all
  ];

  it("cuts the catalog by the blended figure, not the author's word alone", () => {
    assert.deepEqual(ids(filterByHeat(showing, { min: 3, max: 5 })), ["a", "c"]);
    assert.deepEqual(ids(filterByHeat(showing, { min: 0.5, max: 2.5 })), ["b"]);
  });

  it("keeps a level sitting exactly on either end of the range", () => {
    assert.deepEqual(ids(filterByHeat(showing, { min: 2, max: 3.5 })), ["a", "b"]);
  });

  it("puts swapped ends back in order rather than showing nothing", () => {
    assert.deepEqual(ids(filterByHeat(showing, { min: 5, max: 3 })), ["a", "c"]);
  });

  it("keeps a level with no figure only when the whole scale is asked for", () => {
    assert.deepEqual(ids(filterByHeat(showing, WHOLE_SCALE)), ["a", "b", "c", "d"]);
    assert.deepEqual(ids(filterByHeat(showing, { min: 0.5, max: 4.5 })), ["a", "b"]);
  });
});

describe("catalogEmptySentence()", () => {
  it("says nothing when no cut was made, where an empty list is the catalog's to explain", () => {
    assert.equal(catalogEmptySentence(WHOLE_CATALOG), undefined);
  });

  it("lets whichever cut is the only one narrowed explain itself", () => {
    assert.match(
      catalogEmptySentence({ ...WHOLE_CATALOG, heat: { min: 3, max: 4 } })!,
      /difficulty/iu,
    );
    assert.match(
      catalogEmptySentence({ ...WHOLE_CATALOG, heartedOnly: true })!,
      /hearted/iu,
    );
    assert.match(catalogEmptySentence({ ...WHOLE_CATALOG, showOwn: false })!, /your own/iu);
    assert.match(
      catalogEmptySentence({
        ...WHOLE_CATALOG,
        statuses: { ...ALL_PLAY_STATUSES, solved: false },
      })!,
      /status/iu,
    );
  });

  it("blames the filters as a whole when more than one of them is narrowed", () => {
    assert.match(
      catalogEmptySentence({
        ...WHOLE_CATALOG,
        heat: { min: 3, max: 4 },
        heartedOnly: true,
      })!,
      /filters/iu,
    );
  });
});

describe("filterWork()", () => {
  const showing = [
    { level: { id: "a", status: "draft" as const, unpitchedCount: 4 } },
    { level: { id: "b", status: "draft" as const, unpitchedCount: 0 } },
    { level: { id: "c", status: "published" as const, unpitchedCount: 0 } },
  ];

  it("shows every kind of work when every status is on", () => {
    assert.deepEqual(ids(filterWork(showing, ALL_WORK_STATUSES)), ["a", "b", "c"]);
  });

  it("keeps only the statuses that are on", () => {
    assert.deepEqual(
      ids(filterWork(showing, { ...ALL_WORK_STATUSES, published: false })),
      ["a", "b"],
    );
    assert.deepEqual(
      ids(filterWork(showing, { unfinished: false, complete: false, published: true })),
      ["c"],
    );
  });
});

describe("workEmptySentence()", () => {
  it("says nothing while every status is on, where the page explains itself", () => {
    assert.equal(workEmptySentence(ALL_WORK_STATUSES), undefined);
  });

  it("blames the statuses when one of them is off", () => {
    assert.match(
      workEmptySentence({ ...ALL_WORK_STATUSES, complete: false })!,
      /status/iu,
    );
  });
});
