import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAccountProgressStore,
  progressStoreFor,
} from "../dist/puzzle/account-progress.js";
import {
  createLocalProgressStore,
  type Fetch,
  type FetchInit,
  type PlayProgress,
} from "../dist/puzzle/progress.js";
import { stubStorage } from "./helpers/stub-storage.js";

const ID = "k3m9x2p7qw4t";
const OTHER = "aaaaaaaaaaaa";

const PROGRESS: PlayProgress = {
  levelId: ID,
  elapsedMs: 252_000,
  checkCount: 3,
  solvedAt: undefined,
  pitches: [{ index: 0, midi: 60 }],
  judged: [{ index: 0, midi: 60, correct: true }],
};

type Reply = { status: number; body?: unknown } | "unreachable";

/**
 * Enough of `fetch`: it answers every request the one way it was told to,
 * and keeps what it was asked so a test can check what left the page.
 */
function stubFetch(reply: Reply | ((url: string, init: FetchInit) => Reply)) {
  const calls: { url: string; init: FetchInit }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init });
    const answer = typeof reply === "function" ? reply(url, init) : reply;
    if (answer === "unreachable") {
      throw new TypeError("Failed to fetch");
    }
    return {
      ok: answer.status < 400,
      status: answer.status,
      json: async () => {
        if (answer.body === undefined) throw new SyntaxError("Unexpected end of JSON input");
        return answer.body;
      },
    };
  };
  return { calls, fetch };
}

/** An account store over a stub server, with a local store behind it. */
function accountStore(reply: Parameters<typeof stubFetch>[0]) {
  const { calls, fetch } = stubFetch(reply);
  const { storage, held } = stubStorage();
  const local = createLocalProgressStore(storage);
  const store = createAccountProgressStore({ fetch, fallback: local });
  return { calls, store, local, held };
}

describe("createAccountProgressStore().read()", () => {
  it("asks the server for the one level, and hands back what it said", async () => {
    const { store, calls } = accountStore({ status: 200, body: PROGRESS });

    assert.deepEqual(await store.read(ID), PROGRESS);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `/api/progress/${ID}`);
    assert.equal(calls[0]!.init.method, "GET");
    assert.equal(calls[0]!.init.headers.accept, "application/json");
  });

  it("answers nothing for a 204 without looking in this browser", async () => {
    const { store, local } = accountStore({ status: 204 });
    await local.write(PROGRESS);

    assert.equal(await store.read(ID), undefined);
  });

  it("falls back to this browser's record when the session has run out", async () => {
    const { store, local } = accountStore({ status: 401, body: { error: "Sign in." } });
    await local.write(PROGRESS);

    assert.deepEqual(await store.read(ID), PROGRESS);
  });

  it("falls back to this browser's record when the level cannot be seen", async () => {
    const { store, local } = accountStore({ status: 404, body: { error: "No." } });
    await local.write(PROGRESS);

    assert.deepEqual(await store.read(ID), PROGRESS);
  });

  it("falls back to this browser's record when the server cannot be reached", async () => {
    const { store, local } = accountStore("unreachable");
    await local.write(PROGRESS);

    assert.deepEqual(await store.read(ID), PROGRESS);
    assert.equal(await store.read(OTHER), undefined);
  });

  it("falls back when the server's answer is not progress", async () => {
    for (const body of [undefined, "garbage", { ...PROGRESS, levelId: OTHER }, { levelId: ID }]) {
      const { store, local } = accountStore({ status: 200, body });
      await local.write(PROGRESS);
      assert.deepEqual(await store.read(ID), PROGRESS, JSON.stringify(body));
    }
  });
});

describe("createAccountProgressStore().write()", () => {
  it("puts the record where the server keeps it, with keepalive so a save on the way out survives", async () => {
    const { store, calls } = accountStore({ status: 204 });

    await store.write(PROGRESS);

    assert.equal(calls.length, 1);
    const { url, init } = calls[0]!;
    assert.equal(url, `/api/progress/${ID}`);
    assert.equal(init.method, "PUT");
    assert.equal(init.headers["content-type"], "application/json");
    assert.equal(init.keepalive, true);
    assert.deepEqual(JSON.parse(init.body!), {
      elapsedMs: PROGRESS.elapsedMs,
      pitches: PROGRESS.pitches,
      judged: PROGRESS.judged,
    });
  });

  it("sends nothing the server owns: neither the check count nor the solved time", async () => {
    const { store, calls } = accountStore({ status: 204 });

    await store.write({ ...PROGRESS, solvedAt: 1_754_500_000_000 });

    const sent = JSON.parse(calls[0]!.init.body!) as Record<string, unknown>;
    assert.equal("checkCount" in sent, false);
    assert.equal("solvedAt" in sent, false);
    assert.equal("levelId" in sent, false);
  });

  it("leaves this browser alone when the server took it", async () => {
    const { store, held } = accountStore({ status: 204 });

    await store.write(PROGRESS);

    assert.equal(held.size, 0);
  });

  it("keeps the record in this browser when the session has run out, which is what the hand-off picks up later", async () => {
    const { store, local } = accountStore({ status: 401, body: { error: "Sign in." } });

    await store.write(PROGRESS);

    assert.deepEqual(await local.read(ID), PROGRESS);
  });

  it("keeps the record in this browser when the server cannot be reached", async () => {
    const { store, local } = accountStore("unreachable");

    await assert.doesNotReject(() => store.write(PROGRESS));

    assert.deepEqual(await local.read(ID), PROGRESS);
  });

  it("drops a record for a level that is gone rather than filing it anywhere", async () => {
    const { store, held } = accountStore({ status: 404, body: { error: "No level." } });

    await store.write(PROGRESS);

    assert.equal(held.size, 0);
  });
});

describe("createAccountProgressStore().readMany()", () => {
  const other = { ...PROGRESS, levelId: OTHER, checkCount: 9 };

  it("asks once for everything the account has, and keeps only the levels asked about", async () => {
    const { store, calls } = accountStore({
      status: 200,
      body: [PROGRESS, other, { ...PROGRESS, levelId: "bbbbbbbbbbbb" }],
    });

    const many = await store.readMany([ID, OTHER, "cccccccccccc"]);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "/api/progress");
    assert.equal(calls[0]!.init.method, "GET");
    assert.deepEqual([...many.keys()].sort(), [OTHER, ID].sort());
    assert.equal(many.get(OTHER)!.checkCount, 9);
  });

  it("asks nothing when there are no levels to ask about", async () => {
    const { store, calls } = accountStore({ status: 200, body: [] });

    assert.deepEqual(await store.readMany([]), new Map());
    assert.equal(calls.length, 0);
  });

  it("skips a record it cannot read and keeps the rest", async () => {
    const { store } = accountStore({
      status: 200,
      body: [PROGRESS, "garbage", { levelId: OTHER }, { ...other, pitches: "none" }],
    });

    const many = await store.readMany([ID, OTHER]);

    assert.deepEqual([...many.keys()], [ID]);
  });

  it("falls back to this browser's records when the session has run out", async () => {
    const { store, local } = accountStore({ status: 401, body: { error: "Sign in." } });
    await local.write(PROGRESS);

    const many = await store.readMany([ID, OTHER]);

    assert.deepEqual([...many.keys()], [ID]);
  });

  it("falls back to this browser's records when the server cannot be reached, or answers something else", async () => {
    for (const reply of ["unreachable", { status: 200, body: { not: "a list" } }] as const) {
      const { store, local } = accountStore(reply);
      await local.write(PROGRESS);
      assert.deepEqual([...(await store.readMany([ID])).keys()], [ID]);
    }
  });
});

describe("progressStoreFor()", () => {
  const user = { id: "7k2m9x4p3qwt", email: "jason@example.com", username: undefined, isAdmin: false };

  it("hands a signed-in viewer the account store, which is what sends the first request", async () => {
    const { calls, fetch } = stubFetch({ status: 204 });
    const local = createLocalProgressStore(stubStorage().storage);

    const store = progressStoreFor(user, { fetch, local });
    await store.read(ID);

    assert.equal(calls.length, 1);
  });

  it("hands nobody the local store itself, untouched", async () => {
    const { calls, fetch } = stubFetch({ status: 204 });
    const local = createLocalProgressStore(stubStorage().storage);

    const store = progressStoreFor(undefined, { fetch, local });
    await store.read(ID);

    assert.equal(store, local);
    assert.equal(calls.length, 0);
  });
});
