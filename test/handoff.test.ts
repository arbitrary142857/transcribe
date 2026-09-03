import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VIEWER_KEY,
  forgetLocalProgress,
  forgetQuestion,
  handoffFor,
  handoffSentence,
  isNewHere,
  markSeenHere,
  mergeIntoAccount,
  mergeQuestion,
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

describe("isNewHere()", () => {
  it("calls an account new here when nothing has been written", () => {
    assert.equal(isNewHere(stubStorage().storage, ME), true);
  });

  it("calls an account new here when the marker names somebody else", () => {
    const { storage } = stubStorage({ [VIEWER_KEY]: "2b4d6f8h0j1k" });

    assert.equal(isNewHere(storage, ME), true);
  });

  it("calls an account known here once markSeenHere has named it", () => {
    const { storage } = stubStorage();

    markSeenHere(storage, ME);

    assert.equal(isNewHere(storage, ME), false);
    assert.equal(isNewHere(storage, "2b4d6f8h0j1k"), true);
  });

  it("reads a storage that refuses as nobody having been seen, and lets the marking pass", () => {
    assert.equal(isNewHere(refusingStorage, ME), true);
    assert.doesNotThrow(() => markSeenHere(refusingStorage, ME));
  });
});

describe("handoffFor()", () => {
  it("asks when the account is new here and there is something to bring", async () => {
    const { storage, local } = await browserWith(PROGRESS, OTHER_PROGRESS);

    const handoff = await handoffFor(storage, local, ME);

    assert.equal(handoff.ask, true);
    assert.deepEqual(handoff.records.map((record) => record.levelId).sort(), [OTHER, ID]);
  });

  it("does not ask when there is nothing to bring, though the account is new here", async () => {
    const { storage, local } = await browserWith();

    const handoff = await handoffFor(storage, local, ME);

    assert.equal(handoff.ask, false);
    assert.deepEqual(handoff.records, []);
  });

  it("does not ask again once the account has been seen here, though the records remain", async () => {
    const { storage, local } = await browserWith(PROGRESS);
    markSeenHere(storage, ME);

    const handoff = await handoffFor(storage, local, ME);

    assert.equal(handoff.ask, false);
    assert.deepEqual(handoff.records, [PROGRESS]);
  });

  it("never counts a record that cannot be read", async () => {
    const { storage, local } = await browserWith();
    storage.setItem(`transcribe:progress:${ID}`, "not json");

    const handoff = await handoffFor(storage, local, ME);

    assert.equal(handoff.ask, false);
  });
});

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
    assert.match(mergeQuestion(1).body.join(" "), /1 tune played/);
    assert.match(mergeQuestion(3).body.join(" "), /3 tunes played/);
    assert.match(forgetQuestion(1).body.join(" "), /1 tune/);
    assert.match(handoffSentence(1), /1 tune played/);
    assert.match(handoffSentence(2), /2 tunes played/);
  });

  it("says the records leave this browser and that it cannot be undone", () => {
    const merge = mergeQuestion(2);
    assert.match(merge.body.join(" "), /leave this browser/);
    assert.match(merge.body.join(" "), /cannot be undone/);
    assert.equal(merge.confirm, "Bring it in");
    assert.equal(merge.cancel, "Leave it here");

    const forget = forgetQuestion(2);
    assert.match(forget.body.join(" "), /cannot be undone/);
    assert.equal(forget.confirm, "Forget it");
  });
});
