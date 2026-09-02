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
  errorOf,
  stubDatabase,
  type Answer,
  type Row,
} from "./helpers/stub-database.js";

const ID = "k3m9x2p7qw4t";

/** Answers keyed by table, as everywhere: the stand-in matches first. */
const levelAnswer = (over: Row = {}): Answer => ({
  when: /FROM transcriptions/iu,
  first: { owner_id: "7k2m9x4p3qwt", status: "published", ...over },
});

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

const upvotedAnswer = (): Answer => ({
  when: /FROM upvotes/iu,
  first: { created_at: 7 },
});

const request = async (
  method: "PUT" | "DELETE" | "GET",
  answers: readonly Answer[],
  headers: Record<string, string> = SIGNED_IN,
  id: string = ID,
) => {
  const { asked, env } = stubDatabase(answers);
  const response = await api.request(
    `/api/tunes/${id}/upvote`,
    { method, headers },
    env,
  );
  return { response, asked };
};

describe("PUT /api/tunes/:id/upvote", () => {
  it("stands a solver's upvote, and stands it once however often it is pressed", async () => {
    const { response, asked } = await request("PUT", [asStranger(), levelAnswer(), solvedAnswer()]);

    assert.equal(response.status, 204);
    const given = asked.at(-1)!;
    assert.match(given.sql, /INSERT INTO upvotes/iu);
    assert.match(given.sql, /ON CONFLICT \(user_id, level_id\) DO NOTHING/iu);
    assert.equal(given.values[0], STRANGER_ID);
    assert.equal(given.values[1], ID);
  });

  it("asks nobody to upvote before signing in", async () => {
    const { response, asked } = await request("PUT", [], {});

    assert.equal(response.status, 401);
    assert.equal(asked.filter((each) => /upvotes/iu.test(each.sql)).length, 0);
  });

  it("tells a strange id there is no tune, without asking the database", async () => {
    const { response, asked } = await request("PUT", [asStranger()], SIGNED_IN, "x");

    assert.equal(response.status, 404);
    assert.equal(asked.length, 0);
  });

  it("refuses the author's upvote of their own tune", async () => {
    const { response, asked } = await request("PUT", [asOwner(), levelAnswer(), solvedAnswer()]);

    assert.equal(response.status, 403);
    assert.match(await errorOf(response), /author/iu);
    assert.equal(asked.filter((each) => /upvotes/iu.test(each.sql)).length, 0);
  });

  it("refuses an upvote from an account that keeps its play out of the figures", async () => {
    const { response, asked } = await request("PUT", [
      { ...asStranger(), first: { ...asStranger().first!, share_stats: 0 } },
      levelAnswer(),
      solvedAnswer(),
    ]);

    assert.equal(response.status, 403);
    assert.match(await errorOf(response), /share/iu);
    assert.equal(asked.filter((each) => /upvotes/iu.test(each.sql)).length, 0);
  });

  it("refuses an upvote from somebody who has not solved the level", async () => {
    const unsolved = await request("PUT", [
      asStranger(),
      levelAnswer(),
      solvedAnswer({ solved_at: null }),
    ]);
    assert.equal(unsolved.response.status, 403);
    assert.match(await errorOf(unsolved.response), /solved/iu);

    const neverPlayed = await request("PUT", [asStranger(), levelAnswer()]);
    assert.equal(neverPlayed.response.status, 403);
    assert.equal(
      neverPlayed.asked.filter((each) => /upvotes/iu.test(each.sql)).length,
      0,
    );
  });

  it("refuses an upvote of a draft, telling everybody only that there is no tune", async () => {
    for (const who of [asStranger(), asOwner()]) {
      const { response } = await request("PUT", [
        who,
        levelAnswer({ status: "draft" }),
        solvedAnswer(),
      ]);
      assert.equal(response.status, 404);
    }
  });
});

describe("DELETE /api/tunes/:id/upvote", () => {
  it("lets a solver take their upvote back entirely", async () => {
    const { response, asked } = await request("DELETE", [asStranger()]);

    assert.equal(response.status, 204);
    const cleared = asked.at(-1)!;
    assert.match(cleared.sql, /DELETE FROM upvotes/iu);
    assert.deepEqual(cleared.values, [STRANGER_ID, ID]);
  });

  it("asks nobody to take an upvote back before signing in", async () => {
    const { response, asked } = await request("DELETE", [], {});

    assert.equal(response.status, 401);
    assert.equal(asked.filter((each) => /upvotes/iu.test(each.sql)).length, 0);
  });
});

describe("GET /api/tunes/:id/upvote", () => {
  it("says whether the caller's own upvote stands", async () => {
    const standing = await request("GET", [asStranger(), upvotedAnswer()]);
    assert.equal(standing.response.status, 200);
    assert.deepEqual(await standing.response.json(), { upvoted: true });

    const absent = await request("GET", [asStranger()]);
    assert.deepEqual(await absent.response.json(), { upvoted: false });
  });

  it("asks nobody for their upvote before signing in", async () => {
    const { response } = await request("GET", [], {});

    assert.equal(response.status, 401);
  });
});
