import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { api } from "../dist-worker/worker/routes.js";
import { SIGNED_IN, asOwner, asStranger } from "./helpers/signed-in.js";
import { stubDatabase, type Answer, type Row } from "./helpers/stub-database.js";

const ID = "k3m9x2p7qw4t";
const OWNER = "7k2m9x4p3qwt";

const levelAnswer = (over: Row = {}): Answer => ({
  when: /FROM transcriptions/iu,
  first: { owner_id: OWNER, status: "published", ...over },
});

/** A qualifying solve, as PROGRESS_SQL.solveTimes reads one. */
const solve = (elapsed_ms: number, check_count: number): Row => ({
  elapsed_ms,
  check_count,
});

const timesAnswer = (rows: readonly Row[]): Answer => ({
  when: /FROM progress/iu,
  rows,
});

const stats = async (
  answers: readonly Answer[],
  headers: Record<string, string> = {},
  id: string = ID,
) => {
  const { asked, env } = stubDatabase(answers);
  const response = await api.request(`/api/levels/${id}/stats`, { headers }, env);
  return { response, asked };
};

describe("GET /api/levels/:id/stats", () => {
  it("answers both medians for a published level, from sharing players' solves", async () => {
    const { response, asked } = await stats([
      levelAnswer(),
      timesAnswer([
        solve(60_000, 1),
        solve(120_000, 2),
        solve(30_000, 1),
        solve(90_000, 1),
      ]),
    ]);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      medianSolveMs: 75_000,
      medianFlawlessMs: 60_000,
    });
    // The statement leaves out anybody not sharing, and the author's own
    // solves; the route binds the author rather than trusting anything.
    const read = asked.at(-1)!;
    assert.match(read.sql, /share_stats = 1/i);
    assert.deepEqual(read.values, [ID, OWNER]);
  });

  it("leaves a median out under three qualifying solves, which is the dash the page draws", async () => {
    const thin = await stats([
      levelAnswer(),
      timesAnswer([solve(60_000, 1), solve(90_000, 2)]),
    ]);
    assert.deepEqual(await thin.response.json(), {});

    // Four solves but only two flawless: the overall figure stands alone.
    const partly = await stats([
      levelAnswer(),
      timesAnswer([
        solve(60_000, 1),
        solve(120_000, 2),
        solve(30_000, 1),
        solve(90_000, 3),
      ]),
    ]);
    assert.deepEqual(await partly.response.json(), { medianSolveMs: 75_000 });
  });

  it("asks nobody who they are for a published level", async () => {
    const { asked } = await stats([levelAnswer(), timesAnswer([])]);

    assert.equal(asked.some((each) => /FROM sessions/i.test(each.sql)), false);
  });

  it("hides a draft's figures from a stranger as the level itself is hidden, and shows its author", async () => {
    const stranger = await stats(
      [asStranger(), levelAnswer({ status: "draft" }), timesAnswer([])],
      SIGNED_IN,
    );
    assert.equal(stranger.response.status, 404);

    const owner = await stats(
      [asOwner(), levelAnswer({ status: "draft" }), timesAnswer([])],
      SIGNED_IN,
    );
    assert.equal(owner.response.status, 200);
  });

  it("tells a strange id there is no level, without asking the database", async () => {
    const { response, asked } = await stats([], {}, "x");

    assert.equal(response.status, 404);
    assert.equal(asked.length, 0);
  });

  it("says so plainly when there is no such level", async () => {
    const { response } = await stats([timesAnswer([])]);

    assert.equal(response.status, 404);
  });
});
