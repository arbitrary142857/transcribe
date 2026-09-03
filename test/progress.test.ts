import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLocalProgressStore,
  type PlayProgress,
} from "../dist/puzzle/progress.js";
import { refusingStorage, stubStorage } from "./helpers/stub-storage.js";

const PROGRESS: PlayProgress = {
  levelId: "k3m9x2p7qw4t",
  elapsedMs: 252_000,
  checkCount: 3,
  solvedAt: undefined,
  assisted: false,
  pitches: [
    { index: 0, midi: 60 },
    { index: 1, midi: 64 },
  ],
  judged: [
    { index: 0, midi: 60, correct: true },
    { index: 1, midi: 62, correct: false },
    { index: 1, midi: 64, correct: false },
  ],
};

describe("createLocalProgressStore()", () => {
  it("hands back what it was given", async () => {
    const { storage } = stubStorage();
    const store = createLocalProgressStore(storage);

    await store.write(PROGRESS);

    assert.deepEqual(await store.read(PROGRESS.levelId), PROGRESS);
  });

  it("carries a solved time across, which is what reopens the banner", async () => {
    const { storage } = stubStorage();
    const store = createLocalProgressStore(storage);
    const solved = { ...PROGRESS, solvedAt: 1_754_500_000_000 };

    await store.write(solved);

    assert.deepEqual(await store.read(solved.levelId), solved);
  });

  it("knows nothing about a level nobody has played", async () => {
    const store = createLocalProgressStore(stubStorage().storage);

    assert.equal(await store.read("k3m9x2p7qw4t"), undefined);
  });

  it("keeps each level's progress apart from every other's", async () => {
    const { storage } = stubStorage();
    const store = createLocalProgressStore(storage);

    await store.write(PROGRESS);
    await store.write({ ...PROGRESS, levelId: "aaaaaaaaaaaa", checkCount: 9 });

    assert.equal((await store.read(PROGRESS.levelId))!.checkCount, 3);
    assert.equal((await store.read("aaaaaaaaaaaa"))!.checkCount, 9);
  });

  it("forgets anything it cannot read back as progress", async () => {
    // Local storage is the player's own to edit, and a version of this code
    // that stored another shape may have written it. Neither is worth a thrown
    // page: a puzzle that opens fresh is the right answer to both.
    for (const held of [
      "not json",
      "null",
      "[]",
      '{"levelId":"k3m9x2p7qw4t"}',
      '{"levelId":"k3m9x2p7qw4t","elapsedMs":"ages","checkCount":1,"pitches":[]}',
      '{"levelId":"k3m9x2p7qw4t","elapsedMs":1,"checkCount":1,"pitches":"none"}',
      '{"levelId":"k3m9x2p7qw4t","elapsedMs":1,"checkCount":1,"pitches":[{"index":0}]}',
      '{"levelId":"k3m9x2p7qw4t","elapsedMs":-1,"checkCount":1,"pitches":[]}',
    ]) {
      const { storage } = stubStorage({
        "transcribe:progress:k3m9x2p7qw4t": held,
      });
      const store = createLocalProgressStore(storage);

      assert.equal(await store.read("k3m9x2p7qw4t"), undefined, held);
    }
  });

  it("refuses progress filed under another level, however it got there", async () => {
    const { storage } = stubStorage({
      "transcribe:progress:k3m9x2p7qw4t": JSON.stringify({
        ...PROGRESS,
        levelId: "aaaaaaaaaaaa",
      }),
    });
    const store = createLocalProgressStore(storage);

    assert.equal(await store.read("k3m9x2p7qw4t"), undefined);
  });

  it("keeps only the fields it knows, so nothing rides along", async () => {
    const { storage } = stubStorage({
      "transcribe:progress:k3m9x2p7qw4t": JSON.stringify({
        ...PROGRESS,
        answer: "C E G",
      }),
    });
    const store = createLocalProgressStore(storage);

    assert.deepEqual(await store.read("k3m9x2p7qw4t"), PROGRESS);
  });

  it("lets a write that cannot happen pass rather than break the puzzle", async () => {
    // Safari in private browsing throws from setItem. Losing the record of a
    // session is a nuisance; losing the note you were entering is not.
    const store = createLocalProgressStore(refusingStorage);

    await assert.doesNotReject(() => store.write(PROGRESS));
  });
});

describe("createLocalProgressStore().readMany()", () => {
  it("answers one record per level it knows and none for the rest", async () => {
    const { storage } = stubStorage();
    const store = createLocalProgressStore(storage);
    await store.write(PROGRESS);
    await store.write({ ...PROGRESS, levelId: "aaaaaaaaaaaa", checkCount: 9 });

    const many = await store.readMany([PROGRESS.levelId, "bbbbbbbbbbbb", "aaaaaaaaaaaa"]);

    assert.deepEqual([...many.keys()], [PROGRESS.levelId, "aaaaaaaaaaaa"]);
    assert.equal(many.get("aaaaaaaaaaaa")!.checkCount, 9);
  });

  it("answers an empty map for no levels", async () => {
    const store = createLocalProgressStore(stubStorage().storage);

    assert.deepEqual(await store.readMany([]), new Map());
  });
});

describe("createLocalProgressStore().readAll()", () => {
  it("lists every record this browser holds, and only those", async () => {
    const { storage } = stubStorage({
      "transcribe:compact-levels": "1",
      "transcribe:draft": JSON.stringify({ melody: {} }),
      "transcribe:viewer": "7k2m9x4p3qwt",
    });
    const store = createLocalProgressStore(storage);
    await store.write(PROGRESS);
    await store.write({ ...PROGRESS, levelId: "aaaaaaaaaaaa" });

    const all = await store.readAll();

    assert.deepEqual(
      all.map((record) => record.levelId).sort(),
      ["aaaaaaaaaaaa", PROGRESS.levelId],
    );
  });

  it("leaves out a record it cannot read, so nothing broken is ever sent", async () => {
    const { storage } = stubStorage({
      "transcribe:progress:aaaaaaaaaaaa": "not json",
      "transcribe:progress:bbbbbbbbbbbb": JSON.stringify({ ...PROGRESS, levelId: "cccccccccccc" }),
    });
    const store = createLocalProgressStore(storage);
    await store.write(PROGRESS);

    assert.deepEqual(await store.readAll(), [PROGRESS]);
  });

  it("leaves out a key whose suffix is not a level id", async () => {
    const { storage } = stubStorage({
      "transcribe:progress:": JSON.stringify(PROGRESS),
      "transcribe:progress:NOT-AN-ID": JSON.stringify(PROGRESS),
      "transcribe:progress:k3m9x2p7qw4t/extra": JSON.stringify(PROGRESS),
    });

    assert.deepEqual(await createLocalProgressStore(storage).readAll(), []);
  });

  it("answers nothing when storage cannot be walked", async () => {
    assert.deepEqual(await createLocalProgressStore(refusingStorage).readAll(), []);
  });
});

describe("createLocalProgressStore().remove()", () => {
  it("forgets one level and keeps the others", async () => {
    const { storage, held } = stubStorage();
    const store = createLocalProgressStore(storage);
    await store.write(PROGRESS);
    await store.write({ ...PROGRESS, levelId: "aaaaaaaaaaaa" });

    await store.remove(PROGRESS.levelId);

    assert.equal(await store.read(PROGRESS.levelId), undefined);
    assert.notEqual(await store.read("aaaaaaaaaaaa"), undefined);
    assert.deepEqual([...held.keys()], ["transcribe:progress:aaaaaaaaaaaa"]);
  });

  it("lets a storage that refuses pass", async () => {
    await assert.doesNotReject(() =>
      createLocalProgressStore(refusingStorage).remove(PROGRESS.levelId),
    );
  });
});

describe("the judged pitches", () => {
  const stored = (over: Record<string, unknown>) =>
    JSON.stringify({ ...PROGRESS, ...over });

  it("comes back empty from a record written before it existed", () => {
    // Progress saved by an older build is still progress; it simply has no
    // verdicts to colour with, which is where it was before this was stored.
    const { judged, ...older } = PROGRESS;
    const { storage } = stubStorage({
      "transcribe:progress:k3m9x2p7qw4t": JSON.stringify(older),
    });

    return createLocalProgressStore(storage)
      .read("k3m9x2p7qw4t")
      .then((read) => assert.deepEqual(read, { ...older, judged: [] }));
  });

  it("forgets the whole record when a verdict cannot be read", async () => {
    // The rest of a record carrying a broken one is not to be trusted either.
    for (const broken of [
      stored({ judged: "none" }),
      stored({ judged: [{ index: 0, midi: 60 }] }),
      stored({ judged: [{ index: 0, midi: 60, correct: "yes" }] }),
      stored({ judged: [{ index: -1, midi: 60, correct: true }] }),
      stored({ judged: [{ index: 0, midi: 900, correct: true }] }),
    ]) {
      const { storage } = stubStorage({
        "transcribe:progress:k3m9x2p7qw4t": broken,
      });
      const read = await createLocalProgressStore(storage).read("k3m9x2p7qw4t");
      assert.equal(read, undefined, broken);
    }
  });
});

describe("the assist mark", () => {
  const stored = (over: Record<string, unknown>) =>
    JSON.stringify({ ...PROGRESS, ...over });

  const read = (held: string) =>
    createLocalProgressStore(
      stubStorage({ "transcribe:progress:k3m9x2p7qw4t": held }).storage,
    ).read("k3m9x2p7qw4t");

  it("comes back across, which is what keeps the two tools unlocked", async () => {
    const { storage } = stubStorage();
    const store = createLocalProgressStore(storage);
    const assisted = { ...PROGRESS, assisted: true };

    await store.write(assisted);

    assert.deepEqual(await store.read(assisted.levelId), assisted);
  });

  it("reads as unassisted from a record written before it existed", async () => {
    // Every solve stored by an older build was earned without the tools,
    // because there were none to use.
    const { assisted, ...older } = PROGRESS;

    assert.deepEqual(await read(JSON.stringify(older)), { ...older, assisted: false });
  });

  it("forgets the whole record when the mark is not a yes or a no", async () => {
    for (const broken of [stored({ assisted: "yes" }), stored({ assisted: 1 })]) {
      assert.equal(await read(broken), undefined, broken);
    }
  });
});
