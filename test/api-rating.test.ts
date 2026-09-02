import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { api } from "../dist-worker/worker/routes.js";
import {
  SIGNED_IN,
  STRANGER_ID,
  asOwner,
  asStranger,
} from "./helpers/signed-in.js";
import {
  boundColumns,
  errorOf,
  stubDatabase,
  type Answer,
  type Row,
} from "./helpers/stub-database.js";

const ID = "k3m9x2p7qw4t";

/**
 * The two columns the rating route reads of a level. The stand-in answers by
 * the first matching pattern, so every answer here is keyed by its table --
 * the level by /FROM transcriptions/, the solve by /FROM progress/, the
 * rating by /ratings/ -- and never by a verb two tables share.
 */
const levelAnswer = (over: Row = {}): Answer => ({
  when: /FROM transcriptions/iu,
  first: { owner_id: "7k2m9x4p3qwt", status: "published", ...over },
});

/** The stranger's solved row, as PROGRESS_SQL.read finds it. */
const solvedAnswer = (over: Row = {}): Answer => ({
  when: /FROM progress/iu,
  first: {
    level_id: ID,
    elapsed_ms: 64_000,
    check_count: 3,
    solved_at: 5,
    pitches: "[]",
    judged: "[]",
    ...over,
  },
});

const request = async (
  method: "PUT" | "DELETE" | "GET",
  body: unknown,
  answers: readonly Answer[],
  headers: Record<string, string> = SIGNED_IN,
  id: string = ID,
) => {
  const { asked, env } = stubDatabase(answers);
  const response = await api.request(
    `/api/tunes/${id}/rating`,
    body === undefined
      ? { method, headers }
      : {
          method,
          headers: { "content-type": "application/json", ...headers },
          body: typeof body === "string" ? body : JSON.stringify(body),
        },
    env,
  );
  return { response, asked };
};

const rate = (
  stars: unknown,
  answers: readonly Answer[],
  headers: Record<string, string> = SIGNED_IN,
  id: string = ID,
) => request("PUT", { stars }, answers, headers, id);

describe("PUT /api/tunes/:id/rating", () => {
  it("records a solver's rating as halves, upserting rather than minting a second row", async () => {
    const { response, asked } = await rate(2.5, [asStranger(), levelAnswer(), solvedAnswer()]);

    assert.equal(response.status, 204);
    const upsert = asked.at(-1)!;
    assert.match(upsert.sql, /INSERT INTO ratings/iu);
    assert.match(upsert.sql, /ON CONFLICT \(user_id, level_id\) DO UPDATE/iu);
    const bound = boundColumns(upsert.sql, upsert.values);
    assert.equal(bound.user_id, STRANGER_ID);
    assert.equal(bound.level_id, ID);
    assert.equal(bound.half, 5);
  });

  it("asks nobody to rate before signing in, and reads no body first", async () => {
    // Not JSON at all: a route that read the body before the session would
    // answer 400 here rather than 401.
    const { response, asked } = await request("PUT", "not json", [], {});

    assert.equal(response.status, 401);
    assert.match(await errorOf(response), /sign in/iu);
    assert.equal(asked.filter((each) => /ratings/iu.test(each.sql)).length, 0);
  });

  it("tells a strange id there is no tune, without asking the database", async () => {
    const { response, asked } = await rate(2.5, [asStranger()], SIGNED_IN, "x");

    assert.equal(response.status, 404);
    assert.equal(asked.length, 0);
  });

  it("refuses a rating that is not half a pepper to five peppers, in halves", async () => {
    for (const stars of [0, 5.5, 2.25, "3", null]) {
      const { response, asked } = await rate(stars, [asStranger(), levelAnswer(), solvedAnswer()]);

      assert.equal(response.status, 400, `took ${JSON.stringify(stars)}`);
      assert.match(await errorOf(response), /half a pepper/iu);
      assert.equal(asked.filter((each) => /ratings/iu.test(each.sql)).length, 0);
    }
  });

  it("refuses the author's rating of their own tune, whose word is already the anchor", async () => {
    const { response, asked } = await rate(2.5, [asOwner(), levelAnswer(), solvedAnswer()]);

    assert.equal(response.status, 403);
    assert.match(await errorOf(response), /author/iu);
    assert.equal(asked.filter((each) => /ratings/iu.test(each.sql)).length, 0);
  });

  it("refuses a rating from an account that keeps its play out of the figures", async () => {
    const { response, asked } = await rate(2.5, [
      asStranger(),
      levelAnswer(),
      solvedAnswer(),
    ]);

    assert.equal(response.status, 204);

    const optedOut = await rate(2.5, [
      { ...asStranger(), first: { ...asStranger().first!, share_stats: 0 } },
      levelAnswer(),
      solvedAnswer(),
    ]);
    assert.equal(optedOut.response.status, 403);
    assert.match(await errorOf(optedOut.response), /share/iu);
    assert.equal(optedOut.asked.filter((each) => /ratings/iu.test(each.sql)).length, 0);
  });

  it("refuses a rating from somebody who has not solved the level", async () => {
    const unsolved = await rate(2.5, [
      asStranger(),
      levelAnswer(),
      solvedAnswer({ solved_at: null }),
    ]);
    assert.equal(unsolved.response.status, 403);
    assert.match(await errorOf(unsolved.response), /solved/iu);

    const neverPlayed = await rate(2.5, [asStranger(), levelAnswer()]);
    assert.equal(neverPlayed.response.status, 403);
    assert.equal(
      neverPlayed.asked.filter((each) => /ratings/iu.test(each.sql)).length,
      0,
    );
  });

  it("refuses a rating of a draft, telling everybody only that there is no tune", async () => {
    // A draft is not playable, so nobody has solved one to rate -- and its
    // existence stays the author's to disclose.
    for (const who of [asStranger(), asOwner()]) {
      const { response } = await rate(2.5, [
        who,
        levelAnswer({ status: "draft" }),
        solvedAnswer(),
      ]);
      assert.equal(response.status, 404);
      assert.equal(await errorOf(response), "There is no tune at that address.");
    }
  });

  it("refuses a body too large to be a rating", async () => {
    const { response } = await request(
      "PUT",
      `{"stars": 2.5, "padding": "${"x".repeat(2048)}"}`,
      [asStranger(), levelAnswer(), solvedAnswer()],
    );

    assert.equal(response.status, 413);
  });
});

describe("DELETE /api/tunes/:id/rating", () => {
  it("lets a solver take their rating back entirely", async () => {
    const { response, asked } = await request("DELETE", undefined, [asStranger()]);

    assert.equal(response.status, 204);
    const cleared = asked.at(-1)!;
    assert.match(cleared.sql, /DELETE FROM ratings/iu);
    assert.deepEqual(cleared.values, [STRANGER_ID, ID]);
  });

  it("asks nobody to take a rating back before signing in", async () => {
    const { response, asked } = await request("DELETE", undefined, [], {});

    assert.equal(response.status, 401);
    assert.equal(asked.filter((each) => /ratings/iu.test(each.sql)).length, 0);
  });
});

describe("GET /api/tunes/:id/rating", () => {
  it("answers a rating nobody has given with 204, and one they have with its stars", async () => {
    const none = await request("GET", undefined, [asStranger()]);
    assert.equal(none.response.status, 204);

    const held = await request("GET", undefined, [
      asStranger(),
      { when: /FROM ratings/iu, first: { half: 7 } },
    ]);
    assert.equal(held.response.status, 200);
    assert.deepEqual(await held.response.json(), { stars: 3.5 });
  });

  it("asks nobody for their rating before signing in", async () => {
    const { response } = await request("GET", undefined, [], {});

    assert.equal(response.status, 401);
  });
});
