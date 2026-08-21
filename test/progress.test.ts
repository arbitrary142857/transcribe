import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLocalProgressStore,
  type PlayProgress,
} from "../dist/puzzle/progress.js";

/**
 * Enough of `Storage` for the store, and no more.
 *
 * A stub rather than the real thing because these tests run in plain Node with
 * no DOM — the same reason `createLocalProgressStore` takes its storage as an
 * argument instead of reaching for `window`.
 */
function stubStorage(seed: Record<string, string> = {}) {
  const held = new Map(Object.entries(seed));
  return {
    held,
    storage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
      removeItem: (key: string) => void held.delete(key),
    },
  };
}

const PROGRESS: PlayProgress = {
  levelId: "k3m9x2p7qw4t",
  elapsedMs: 252_000,
  checkCount: 3,
  solvedAt: undefined,
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
    const store = createLocalProgressStore({
      getItem: () => null,
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
      removeItem: () => {},
    });

    await assert.doesNotReject(() => store.write(PROGRESS));
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
