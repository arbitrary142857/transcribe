import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { api } from "../dist-worker/worker/routes.js";

/** A row exactly as the migration shapes one. */
const ROW = {
  id: "k3m9x2p7qw4t",
  title: "Clair de lune",
  subtitle: "Debussy",
  video_id: "dQw4w9WgXcQ",
  mark_start: 12.5,
  mark_end: 44.25,
  measures: 16,
  clef: "treble",
  meter_beats: 4,
  meter_unit: 4,
  key_fifths: -5,
  key_mode: "major",
  note_count: 41,
  created_at: 1_754_500_000_000,
};

/**
 * Enough of D1 for these routes, keeping every statement it was asked for.
 *
 * The rows it hands back are whatever a test wants, including things the real
 * query would never select — which is the point of one of the tests below.
 */
function stubDatabase(rows: readonly Record<string, unknown>[] = []) {
  const asked: string[] = [];
  const db = {
    prepare(sql: string) {
      asked.push(sql);
      const statement = {
        bind: () => statement,
        all: async () => ({ results: [...rows] }),
        first: async () => rows[0],
      };
      return statement;
    },
  };
  return { asked, env: { DB: db } };
}

const get = async (path: string, rows?: readonly Record<string, unknown>[]) => {
  const { asked, env } = stubDatabase(rows);
  // Hono answers synchronously or not, depending on the route; await takes both.
  const response = await api.request(path, undefined, env);
  return { response, asked };
};

describe("GET /api/levels", () => {
  it("answers with an empty list when nothing has been submitted", async () => {
    const { response } = await get("/api/levels");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });

  it("never asks the database for the melody, which is the answer", async () => {
    // The listing cannot leak the pitches by accident if it never reads them.
    const { asked } = await get("/api/levels");

    assert.equal(asked.length, 1);
    assert.equal(asked[0]?.includes("melody"), false);
    assert.equal(asked[0]?.includes("*"), false);
  });

  it("hands back no melody even when the row it read holds one", async () => {
    // Belt as well as braces: were the query ever widened, the answer still
    // does not reach the page, because nothing here copies it across.
    const { response } = await get("/api/levels", [
      { ...ROW, melody: JSON.stringify({ events: [{ pitch: "secret" }] }) },
    ]);

    const body = await response.text();
    assert.equal(body.includes("secret"), false);
    assert.equal(body.includes("melody"), false);
  });

  it("gives a level the shape the page expects", async () => {
    const { response } = await get("/api/levels", [ROW]);

    assert.deepEqual(await response.json(), [
      {
        id: "k3m9x2p7qw4t",
        title: "Clair de lune",
        subtitle: "Debussy",
        videoId: "dQw4w9WgXcQ",
        markStart: 12.5,
        markEnd: 44.25,
        measures: 16,
        clef: "treble",
        meter: { beats: 4, beatUnit: 4 },
        keyFifths: -5,
        keyMode: "major",
        noteCount: 41,
        createdAt: 1_754_500_000_000,
      },
    ]);
  });

  it("leaves out a subtitle that was never given, rather than sending null", async () => {
    const { response } = await get("/api/levels", [
      { ...ROW, subtitle: null },
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal("subtitle" in level!, false);
  });

  it("asks for no more than a page of them", async () => {
    // An unbounded read of a table that only grows is a trap worth not setting.
    const { asked } = await get("/api/levels");

    assert.match(asked[0]!, /limit/i);
  });

  it("puts the newest first", async () => {
    const { asked } = await get("/api/levels");

    assert.match(asked[0]!, /order by created_at desc/i);
  });
});

describe("the api's edges", () => {
  it("answers an unknown api path with JSON, never a page", async () => {
    const { response } = await get("/api/nonsense");

    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(typeof ((await response.json()) as { error: string }).error, "string");
  });

  it("refuses to let a response be taken for a type it is not", async () => {
    const { response } = await get("/api/levels");

    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  });

  it("reads nothing when there is nothing to read", async () => {
    // No route yet names a single level, so a path that looks like one is a
    // path that does not exist, and the database is never troubled for it.
    const { response, asked } = await get("/api/levels/k3m9x2p7qw4t");

    assert.equal(response.status, 404);
    assert.deepEqual(asked, []);
  });
});
