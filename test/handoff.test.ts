import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  forgetLocalProgress,
  forgetQuestion,
  mergeIntoAccount,
} from "../dist/puzzle/handoff.js";
import {
  createLocalProgressStore,
  type Fetch,
  type FetchInit,
  type PlayProgress,
} from "../dist/puzzle/progress.js";
import { refusingStorage, stubStorage } from "./helpers/stub-storage.js";

const ME = "7k2m9x4p3qwt";
const ID = "k3m9x2p7qw4t";
const OTHER = "aaaaaaaaaaaa";

const PROGRESS: PlayProgress = {
  levelId: ID,
  elapsedMs: 252_000,
  checkCount: 3,
  solvedAt: undefined,
  assisted: false,
  pitches: [{ index: 0, midi: 60 }],
  judged: [{ index: 0, midi: 60, correct: true }],
};

const OTHER_PROGRESS: PlayProgress = { ...PROGRESS, levelId: OTHER };

type Reply = { status: number; body?: unknown } | "unreachable";

function stubFetch(reply: Reply) {
  const calls: { url: string; init: FetchInit }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init });
    if (reply === "unreachable") throw new TypeError("Failed to fetch");
    return {
      ok: reply.status < 400,
      status: reply.status,
      json: async () => {
        if (reply.body === undefined) throw new SyntaxError("nothing");
        return reply.body;
      },
    };
  };
  return { calls, fetch };
}

/** A browser holding these records. */
async function browserWith(...records: PlayProgress[]) {
  const { storage, held } = stubStorage();
  const local = createLocalProgressStore(storage);
  for (const record of records) await local.write(record);
  return { storage, held, local };
}

describe("mergeIntoAccount()", () => {
  it("posts every record as one request", async () => {
    const { local } = await browserWith(PROGRESS, OTHER_PROGRESS);
    const { calls, fetch } = stubFetch({ status: 200, body: { taken: [ID, OTHER] } });

    const outcome = await mergeIntoAccount({ fetch, local, records: [PROGRESS, OTHER_PROGRESS] });

    assert.deepEqual(outcome, { taken: [ID, OTHER] });
    assert.equal(calls.length, 1);
    const { url, init } = calls[0]!;
    assert.equal(url, "/api/progress/merge");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["content-type"], "application/json");
    assert.deepEqual(
      JSON.parse(init.body!),
      JSON.parse(JSON.stringify({ records: [PROGRESS, OTHER_PROGRESS] })),
    );
  });

  it("removes every record it sent once the server has answered for them, taken or not", async () => {
    // A record the server did not take names a level it no longer has, which
    // no later merge could take either; leaving it would keep the offer alive
    // for ever.
    const { local, held } = await browserWith(PROGRESS, OTHER_PROGRESS);
    const { fetch } = stubFetch({ status: 200, body: { taken: [ID] } });

    await mergeIntoAccount({ fetch, local, records: [PROGRESS, OTHER_PROGRESS] });

    assert.equal(held.size, 0);
  });

  it("keeps everything when the server refuses, and says why", async () => {
    const { local, held } = await browserWith(PROGRESS);
    const { fetch } = stubFetch({ status: 401, body: { error: "Sign in to keep your progress." } });

    const outcome = await mergeIntoAccount({ fetch, local, records: [PROGRESS] });

    assert.deepEqual(outcome, { trouble: "Sign in to keep your progress." });
    assert.equal(held.size, 1);
  });

  it("keeps everything when the server cannot be reached", async () => {
    const { local, held } = await browserWith(PROGRESS);
    const { fetch } = stubFetch("unreachable");

    const outcome = await mergeIntoAccount({ fetch, local, records: [PROGRESS] });

    assert.ok("trouble" in outcome);
    assert.equal(held.size, 1);
  });

  it("keeps everything when the server's answer names no tunes", async () => {
    for (const body of [undefined, { taken: "all" }, { taken: [1, 2] }, "ok"]) {
      const { local, held } = await browserWith(PROGRESS);
      const { fetch } = stubFetch({ status: 200, body });

      const outcome = await mergeIntoAccount({ fetch, local, records: [PROGRESS] });

      assert.ok("trouble" in outcome, JSON.stringify(body));
      assert.equal(held.size, 1);
    }
  });
});

describe("forgetLocalProgress()", () => {
  it("removes every record it was given and nothing else", async () => {
    const { local, held } = await browserWith(PROGRESS, OTHER_PROGRESS);
    held.set("transcribe:compact-levels", "1");

    await forgetLocalProgress(local, [PROGRESS]);

    assert.deepEqual([...held.keys()].sort(), ["transcribe:compact-levels", `transcribe:progress:${OTHER}`]);
  });
});

describe("the hand-off wording", () => {
  it("counts one tune in the singular", () => {
    assert.match(forgetQuestion(1).body.join(" "), /1 tune/);
    assert.match(forgetQuestion(2).body.join(" "), /2 tunes/);
  });

  it("says forgetting cannot be undone", () => {
    const forget = forgetQuestion(2);
    assert.match(forget.body.join(" "), /cannot be undone/);
    assert.equal(forget.confirm, "Forget it");
    assert.equal(forget.cancel, "Keep it");
  });
});
