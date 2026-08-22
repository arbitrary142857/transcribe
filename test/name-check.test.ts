import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fetch, FetchInit } from "../dist/puzzle/progress.js";
import { createNameCheck, type NameVerdict } from "../dist/ui/name-check.js";

/** A clock a test turns by hand, in place of setTimeout. */
function stubTimer() {
  let pending: { run: () => void; at: number } | undefined;
  let now = 0;
  return {
    schedule(run: () => void, afterMs: number): () => void {
      pending = { run, at: now + afterMs };
      return () => {
        pending = undefined;
      };
    },
    advance(ms: number) {
      now += ms;
      if (pending !== undefined && pending.at <= now) {
        const { run } = pending;
        pending = undefined;
        run();
      }
    },
  };
}

function stubFetch(answer: (name: string) => { status: number; body?: unknown } | "unreachable") {
  const calls: { url: string; init: FetchInit }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init });
    const name = decodeURIComponent(url.split("name=")[1] ?? "");
    const reply = answer(name);
    if (reply === "unreachable") throw new TypeError("Failed to fetch");
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  };
  return { calls, fetch };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createNameCheck()", () => {
  it("says which rule a name breaks at once, without asking the server", async () => {
    const { calls, fetch } = stubFetch(() => ({ status: 200, body: { available: true } }));
    const timer = stubTimer();
    const said: NameVerdict[] = [];
    const check = createNameCheck({ fetch, current: "quiet-heron", schedule: timer.schedule, onVerdict: (v) => said.push(v) });

    check.typed("a");
    timer.advance(1000);
    await tick();

    assert.deepEqual(said.at(-1), { kind: "problem", sentence: "A username needs at least 2 characters." });
    assert.equal(calls.length, 0);
  });

  it("calls the current name unchanged, and asks nobody about it", async () => {
    const { calls, fetch } = stubFetch(() => ({ status: 200, body: { available: true } }));
    const timer = stubTimer();
    const said: NameVerdict[] = [];
    const check = createNameCheck({ fetch, current: "quiet-heron", schedule: timer.schedule, onVerdict: (v) => said.push(v) });

    check.typed("  quiet-heron ");
    timer.advance(1000);
    await tick();

    assert.deepEqual(said.at(-1), { kind: "unchanged" });
    assert.equal(calls.length, 0);
  });

  it("waits for the typing to stop before asking, and asks once", async () => {
    const { calls, fetch } = stubFetch(() => ({ status: 200, body: { available: true } }));
    const timer = stubTimer();
    const said: NameVerdict[] = [];
    const check = createNameCheck({ fetch, current: "quiet-heron", schedule: timer.schedule, onVerdict: (v) => said.push(v) });

    check.typed("ja");
    timer.advance(100);
    check.typed("jas");
    timer.advance(100);
    check.typed("jason");
    assert.deepEqual(said.at(-1), { kind: "checking" });
    assert.equal(calls.length, 0);

    timer.advance(300);
    await tick();

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "/api/username?name=jason");
    assert.deepEqual(said.at(-1), { kind: "available", name: "jason" });
  });

  it("says a name is taken when the server says so", async () => {
    const { fetch } = stubFetch(() => ({ status: 200, body: { available: false } }));
    const timer = stubTimer();
    const said: NameVerdict[] = [];
    const check = createNameCheck({ fetch, current: "quiet-heron", schedule: timer.schedule, onVerdict: (v) => said.push(v) });

    check.typed("jason");
    timer.advance(300);
    await tick();

    assert.deepEqual(said.at(-1), { kind: "taken" });
  });

  it("believes only the answer to the latest question", async () => {
    // The first answer arrives after the second was asked: it is about a name
    // nobody is looking at any more, and saying "available" for it would be
    // saying it of the wrong name.
    let release: (() => void) | undefined;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const fetch: Fetch = async (url) => {
      calls.push(url);
      if (calls.length === 1) await slow;
      return { ok: true, status: 200, json: async () => ({ available: calls.length === 1 }) };
    };
    const timer = stubTimer();
    const said: NameVerdict[] = [];
    const check = createNameCheck({ fetch, current: "quiet-heron", schedule: timer.schedule, onVerdict: (v) => said.push(v) });

    check.typed("jason");
    timer.advance(300);
    await tick();
    check.typed("jasonm");
    timer.advance(300);
    await tick();
    release!();
    await tick();
    await tick();

    assert.equal(calls.length, 2);
    assert.deepEqual(said.at(-1), { kind: "taken" });
  });

  it("says it could not ask when the server is away, rather than guessing", async () => {
    const { fetch } = stubFetch(() => "unreachable");
    const timer = stubTimer();
    const said: NameVerdict[] = [];
    const check = createNameCheck({ fetch, current: "quiet-heron", schedule: timer.schedule, onVerdict: (v) => said.push(v) });

    check.typed("jason");
    timer.advance(300);
    await tick();

    assert.deepEqual(said.at(-1), { kind: "unknown" });
  });
});
