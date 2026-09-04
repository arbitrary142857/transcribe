/**
 * How often one caller may ask, and the promise that nobody may ask freely.
 *
 * The first block is the whole route table, written out, with the class each
 * route is charged to. It is deliberately a *list* rather than a loop over
 * something clever: this is the file that answers "is every endpoint limited",
 * and the answer is only worth anything if the list is one a reader can check
 * against worker/routes.ts and worker/auth.ts by eye.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callerKeyOf,
  foreignWrite,
  rateClassOf,
  rateLimitsOf,
  type RateClass,
  type RateLimits,
} from "../dist-worker/worker/limits.js";
import { api } from "../dist-worker/worker/routes.js";
import { stubDatabase } from "./helpers/stub-database.js";

/** A tune id of the right shape, so nothing is refused for the wrong reason. */
const ID = "k3m9x2p7qw4t";

/**
 * Every route the Worker registers, and what it costs.
 *
 * Kept in the order the two files declare them, so the two can be read side
 * by side. The count is asserted below, which is what turns "I listed them
 * all" into something that fails when a route is added and this is not.
 */
const ROUTES: readonly [method: string, path: string, expected: RateClass][] = [
  // worker/auth.ts
  ["GET", "/api/auth/google", "auth"],
  ["GET", "/api/auth/callback", "auth"],
  ["GET", "/api/me", "read"],
  ["POST", "/api/auth/logout", "auth"],
  ["GET", "/api/username", "read"],
  ["PATCH", "/api/me", "write"],
  ["DELETE", "/api/me", "heavy"],

  // worker/routes.ts
  ["GET", "/api/tunes", "list"],
  ["GET", "/api/mine", "list"],
  ["POST", "/api/tunes", "heavy"],
  ["GET", `/api/tunes/${ID}/source`, "read"],
  ["PUT", `/api/tunes/${ID}`, "write"],
  ["DELETE", `/api/tunes/${ID}`, "heavy"],
  ["POST", `/api/tunes/${ID}/publish`, "heavy"],
  ["POST", `/api/tunes/${ID}/unpublish`, "heavy"],
  ["GET", `/api/tunes/${ID}/puzzle`, "read"],
  ["POST", `/api/tunes/${ID}/check`, "check"],
  ["GET", "/api/progress", "read"],
  ["GET", `/api/progress/${ID}`, "read"],
  ["PUT", `/api/progress/${ID}`, "write"],
  ["POST", "/api/progress/merge", "heavy"],
  ["PUT", `/api/tunes/${ID}/rating`, "write"],
  ["DELETE", `/api/tunes/${ID}/rating`, "write"],
  ["GET", `/api/tunes/${ID}/rating`, "read"],
  ["PUT", `/api/tunes/${ID}/upvote`, "write"],
  ["DELETE", `/api/tunes/${ID}/upvote`, "write"],
  ["GET", `/api/tunes/${ID}/upvote`, "read"],
  ["GET", "/api/me/upvotes", "read"],
  ["GET", `/api/tunes/${ID}/stats`, "read"],
];

describe("rateClassOf", () => {
  it("charges every route the Worker has to a class", () => {
    for (const [method, path, expected] of ROUTES) {
      assert.equal(
        rateClassOf(method, path),
        expected,
        `${method} ${path} was charged to the wrong class`,
      );
    }
  });

  it("covers the whole route table, so adding a route without listing it fails here", () => {
    assert.equal(ROUTES.length, 29);
  });

  it("charges a path nobody thought of, since a class is what makes a route limited", () => {
    assert.equal(rateClassOf("GET", "/api/whatever/comes/next"), "read");
    assert.equal(rateClassOf("POST", "/api/whatever/comes/next"), "write");
    assert.equal(rateClassOf("DELETE", "/api"), "write");
  });

  it("tells the whole tune's deletion from a rating's, which are one segment apart", () => {
    assert.equal(rateClassOf("DELETE", `/api/tunes/${ID}`), "heavy");
    assert.equal(rateClassOf("DELETE", `/api/tunes/${ID}/rating`), "write");
    assert.equal(rateClassOf("DELETE", `/api/tunes/${ID}/upvote`), "write");
  });

  it("reads a trailing slash as the path without one, so the segment count cannot be gamed", () => {
    assert.equal(rateClassOf("GET", "/api/tunes/"), "list");
    assert.equal(rateClassOf("POST", "//api//tunes//"), "heavy");
    assert.equal(rateClassOf("POST", `/api/tunes/${ID}/check/`), "check");
  });

  it("charges the check route alone, since it is the one that leaks an answer", () => {
    assert.equal(rateClassOf("POST", `/api/tunes/${ID}/check`), "check");
    // The same path by another method is not the oracle.
    assert.equal(rateClassOf("GET", `/api/tunes/${ID}/check`), "read");
  });
});

describe("callerKeyOf", () => {
  it("counts by the address Cloudflare vouches for", () => {
    const request = new Request("https://example.test/api/tunes", {
      headers: { "CF-Connecting-IP": "203.0.113.7" },
    });
    assert.equal(callerKeyOf(request), "203.0.113.7");
  });

  it("puts everybody in one bucket where there is no such header, which is local work", () => {
    const request = new Request("https://example.test/api/tunes");
    assert.equal(callerKeyOf(request), "no-address");
  });
});

// ---- the middleware ------------------------------------------------------

type Asked = { key: string; cls: RateClass };

/**
 * Limiters that answer yes until `allow` is spent, and remember what they
 * were asked -- which is how a test checks that the right bucket was charged
 * rather than merely that something was.
 */
function stubLimits(allow = Infinity): { limits: RateLimits; asked: Asked[] } {
  const asked: Asked[] = [];
  const classes: RateClass[] = ["check", "auth", "heavy", "list", "write", "read"];
  const limits = Object.fromEntries(
    classes.map((cls) => [
      cls,
      {
        limit: async ({ key }: { key: string }) => {
          asked.push({ key, cls });
          return { success: asked.length <= allow };
        },
      },
    ]),
  ) as RateLimits;
  return { limits, asked };
}

const call = async (
  method: string,
  path: string,
  limits: RateLimits | undefined,
  headers: Record<string, string> = {},
) => {
  const { asked, env } = stubDatabase();
  const response = await api.request(path, { method, headers }, { ...env, limits });
  return { response, statements: asked };
};

describe("the rate limit", () => {
  it("charges the request's own class, keyed by the caller", async () => {
    const { limits, asked } = stubLimits();
    await call("GET", "/api/tunes", limits, { "CF-Connecting-IP": "203.0.113.7" });
    assert.deepEqual(asked, [{ cls: "list", key: "list:203.0.113.7" }]);
  });

  it("keeps the classes in separate buckets, so one cannot spend another's", async () => {
    const { limits, asked } = stubLimits();
    await call("GET", "/api/tunes", limits, { "CF-Connecting-IP": "203.0.113.7" });
    await call("POST", `/api/tunes/${ID}/check`, limits, {
      "CF-Connecting-IP": "203.0.113.7",
    });
    assert.deepEqual(
      asked.map((each) => each.key),
      ["list:203.0.113.7", "check:203.0.113.7"],
    );
  });

  it("answers 429 with a sentence and a Retry-After once the allowance is spent", async () => {
    const { limits } = stubLimits(0);
    const { response } = await call("GET", "/api/tunes", limits);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
    const said = (await response.json()) as { error: string };
    assert.match(said.error, /wait a moment/iu);
  });

  it("says something of its own about checking, the one refusal a player might meet", async () => {
    const { limits } = stubLimits(0);
    const { response } = await call("POST", `/api/tunes/${ID}/check`, limits);
    const said = (await response.json()) as { error: string };
    assert.match(said.error, /checking/iu);
  });

  it("refuses before the database is asked anything at all", async () => {
    const { limits } = stubLimits(0);
    const { statements } = await call("GET", "/api/mine", limits, {
      cookie: "session=whatever-a-browser-holds",
    });
    assert.deepEqual(statements, []);
  });

  it("limits a path that names no route, since 404 is an answer too", async () => {
    const { limits, asked } = stubLimits();
    const { response } = await call("GET", "/api/nothing-here", limits);
    assert.equal(response.status, 404);
    assert.equal(asked.length, 1);
  });

  it("limits nothing when there are no limiters, as sign-in works without Google", async () => {
    const { response } = await call("GET", "/api/tunes", undefined);
    assert.equal(response.status, 200);
  });
});

describe("rateLimitsOf", () => {
  const limiter = { limit: async () => ({ success: true }) };
  const six = {
    check: limiter,
    auth: limiter,
    heavy: limiter,
    list: limiter,
    write: limiter,
    read: limiter,
  };

  it("answers the six when the environment has all of them", () => {
    assert.deepEqual(rateLimitsOf(six), six);
  });

  it("answers nothing when one is missing, rather than a set with a hole in it", () => {
    // A hole would be a TypeError inside the middleware -- a 500 on every
    // request charged to that one class, and nowhere obvious to look.
    for (const missing of ["check", "auth", "heavy", "list", "write", "read"] as const) {
      assert.equal(rateLimitsOf({ ...six, [missing]: undefined }), undefined, missing);
    }
  });

  it("answers nothing for a binding that is not a limiter at all", () => {
    assert.equal(rateLimitsOf({ ...six, read: {} as never }), undefined);
  });

  it("answers nothing for an environment with no bindings at all", () => {
    assert.equal(rateLimitsOf({}), undefined);
  });
});

describe("foreignWrite", () => {
  const asked = (method: string, headers: Record<string, string> = {}) =>
    ({
      req: {
        method,
        url: "https://transcribe.jasonmao.me/api/tunes",
        header: (name: string) => headers[name],
      },
    }) as never;

  it("lets a write from this very site through", () => {
    assert.equal(
      foreignWrite(asked("POST", { Origin: "https://transcribe.jasonmao.me" })),
      false,
    );
  });

  it("catches a write sent from somewhere else", () => {
    assert.equal(foreignWrite(asked("POST", { Origin: "https://elsewhere.test" })), true);
  });

  it("says nothing about a read, whatever sent it", () => {
    assert.equal(foreignWrite(asked("GET", { Origin: "https://elsewhere.test" })), false);
  });

  it("lets a write with no Origin at all through, which is everything but a browser", () => {
    assert.equal(foreignWrite(asked("DELETE")), false);
    assert.equal(foreignWrite(asked("POST", { Origin: "" })), false);
  });
});
