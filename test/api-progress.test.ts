import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encode } from "../dist/editor/codec.js";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import type { PlayProgress } from "../dist/puzzle/progress.js";
import { api } from "../dist-worker/worker/routes.js";
import {
  OWNER_ID,
  SIGNED_IN,
  STRANGER_ID,
  asAdmin,
  asOwner,
  asStranger,
} from "./helpers/signed-in.js";
import {
  errorOf,
  stubDatabase,
  type Answer,
  type Asked,
  type Row,
} from "./helpers/stub-database.js";

const C4 = new Pitch("C", 0, 4);
const E4 = new Pitch("E", 0, 4);
const G4 = new Pitch("G", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const C_MAJOR = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;

const melodyOf = (events: readonly NoteEvent[]) =>
  new Melody(C_MAJOR, METER_4_4, events);

/** C E G E: 60, 64, 67, 64. */
const ANSWER = melodyOf([
  new Note(C4, QUARTER),
  new Note(E4, QUARTER),
  new Note(G4, QUARTER),
  new Note(E4, QUARTER),
]);

const ID = "k3m9x2p7qw4t";
const OTHER_ID = "aaaaaaaaaaaa";

/** A level row as the migration shapes one. */
const rowOf = (over: Row = {}): Row => ({
  id: ID,
  title: "Clair de lune",
  subtitle: null,
  instructions: null,
  video_id: "dQw4w9WgXcQ",
  mark_start: 12.5,
  mark_end: 14.5,
  measures: 1,
  clef: "treble",
  meter_beats: 4,
  meter_unit: 4,
  key_fifths: 0,
  key_mode: "major",
  note_count: 4,
  unpitched_count: 0,
  melody: JSON.stringify(encode(ANSWER)),
  owner_id: OWNER_ID,
  status: "published",
  published_at: 1_754_500_000_000,
  updated_at: 1_754_500_000_000,
  created_at: 1_754_500_000_000,
  ...over,
});

const DRAFT = rowOf({ status: "draft", published_at: null });

/** A progress row as the migration shapes one. */
const progressRow = (over: Row = {}): Row => ({
  level_id: ID,
  elapsed_ms: 42_000,
  check_count: 2,
  solved_at: null,
  pitches: JSON.stringify([{ index: 1, midi: 64 }]),
  judged: JSON.stringify([{ index: 1, midi: 64, correct: true }]),
  ...over,
});

const level = (row: Row): Answer => ({ when: /FROM transcriptions/iu, first: row });
const held = (row: Row): Answer => ({ when: /FROM progress/iu, first: row });
const heldAll = (rows: readonly Row[]): Answer => ({ when: /FROM progress/iu, rows });

const call = async (
  path: string,
  init: RequestInit,
  answers: readonly Answer[] = [],
  headers: Record<string, string> = {},
) => {
  const { asked, batches, env } = stubDatabase(answers);
  const response = await api.request(
    path,
    { ...init, headers: { ...(init.headers as Record<string, string>), ...headers } },
    env,
  );
  return { response, asked, batches };
};

const get = (path: string, answers?: readonly Answer[], headers?: Record<string, string>) =>
  call(path, { headers: { accept: "application/json" } }, answers, headers);

const send = (
  method: "PUT" | "POST",
  path: string,
  body: unknown,
  answers?: readonly Answer[],
  headers?: Record<string, string>,
) =>
  call(
    path,
    {
      method,
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    answers,
    headers,
  );

const right = [
  { index: 0, midi: 60 },
  { index: 1, midi: 64 },
  { index: 2, midi: 67 },
  { index: 3, midi: 64 },
];

const record = (over: Partial<PlayProgress> = {}): PlayProgress => ({
  levelId: ID,
  elapsedMs: 5000,
  checkCount: 1,
  solvedAt: undefined,
  pitches: [{ index: 1, midi: 64 }],
  judged: [{ index: 1, midi: 64, correct: true }],
  ...over,
});

const progressStatements = (asked: readonly Asked[]): Asked[] =>
  asked.filter((each) => /progress/i.test(each.sql));

describe("GET /api/progress", () => {
  it("answers 401 without asking the database when nobody is signed in", async () => {
    const { response, asked } = await get("/api/progress");

    assert.equal(response.status, 401);
    assert.equal(typeof (await errorOf(response)), "string");
    assert.deepEqual(asked, []);
  });

  it("lists every level's progress the account holds, as the page keeps it", async () => {
    const { response } = await get(
      "/api/progress",
      [asOwner(), heldAll([progressRow(), progressRow({ level_id: OTHER_ID, solved_at: 7, check_count: 1 })])],
      SIGNED_IN,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      {
        levelId: ID,
        elapsedMs: 42_000,
        checkCount: 2,
        pitches: [{ index: 1, midi: 64 }],
        judged: [{ index: 1, midi: 64, correct: true }],
      },
      {
        levelId: OTHER_ID,
        elapsedMs: 42_000,
        checkCount: 1,
        solvedAt: 7,
        pitches: [{ index: 1, midi: 64 }],
        judged: [{ index: 1, midi: 64, correct: true }],
      },
    ]);
  });

  it("asks only for the rows of the account the session named, most recently touched first, and never a melody", async () => {
    const { asked } = await get("/api/progress", [asOwner(), heldAll([])], SIGNED_IN);

    assert.equal(asked.length, 2);
    const read = asked[1]!;
    assert.match(read.sql, /FROM progress/i);
    assert.match(read.sql, /WHERE user_id = \?/i);
    assert.match(read.sql, /ORDER BY updated_at DESC/i);
    assert.equal(read.values[0], OWNER_ID);
    assert.equal(/melody|transcriptions/i.test(read.sql), false);
  });

  it("leaves out solvedAt on an unsolved row rather than sending null", async () => {
    const { response } = await get("/api/progress", [asOwner(), heldAll([progressRow()])], SIGNED_IN);

    const [only] = (await response.json()) as Record<string, unknown>[];
    assert.equal("solvedAt" in only!, false);
  });

  it("answers an empty list for an account that has played nothing", async () => {
    const { response } = await get("/api/progress", [asOwner()], SIGNED_IN);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });
});

describe("GET /api/progress/:levelId", () => {
  it("answers 401 without asking the database when nobody is signed in", async () => {
    const { response, asked } = await get(`/api/progress/${ID}`, [level(rowOf())]);

    assert.equal(response.status, 401);
    assert.deepEqual(asked, []);
  });

  it("turns away an id that could not be one, without asking the database", async () => {
    const { response, asked } = await get("/api/progress/NOT-AN-ID", [asOwner()], SIGNED_IN);

    assert.equal(response.status, 404);
    assert.deepEqual(asked, []);
  });

  it("hands back the record the account holds for the level", async () => {
    const { response } = await get(
      `/api/progress/${ID}`,
      [asOwner(), level(rowOf()), held(progressRow({ solved_at: 9 }))],
      SIGNED_IN,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      levelId: ID,
      elapsedMs: 42_000,
      checkCount: 2,
      solvedAt: 9,
      pitches: [{ index: 1, midi: 64 }],
      judged: [{ index: 1, midi: 64, correct: true }],
    });
  });

  it("answers 204 and nothing when the account has no record for a level it can see", async () => {
    const { response, asked } = await get(`/api/progress/${ID}`, [asOwner(), level(rowOf())], SIGNED_IN);

    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    const read = asked.at(-1)!;
    assert.match(read.sql, /FROM progress/i);
    assert.deepEqual(read.values, [OWNER_ID, ID]);
  });

  it("answers 404 for a level that is not there and for a draft that is not the viewer's, in the same words", async () => {
    const missing = await get(`/api/progress/${ID}`, [asOwner()], SIGNED_IN);
    const hidden = await get(`/api/progress/${ID}`, [asStranger(), level(DRAFT)], SIGNED_IN);

    assert.equal(missing.response.status, 404);
    assert.equal(hidden.response.status, 404);
    assert.equal(await errorOf(missing.response), await errorOf(hidden.response));
    assert.equal(progressStatements(hidden.asked).length, 0);
  });

  it("hands the author, and an admin, their record on a draft", async () => {
    for (const who of [asOwner(), asAdmin()]) {
      const { response } = await get(
        `/api/progress/${ID}`,
        [who, level(DRAFT), held(progressRow())],
        SIGNED_IN,
      );
      assert.equal(response.status, 200);
    }
  });

  it("reads the level for its owner and status alone, never its melody", async () => {
    const { asked } = await get(`/api/progress/${ID}`, [asOwner(), level(rowOf())], SIGNED_IN);

    const levelRead = asked.find((each) => /FROM transcriptions/i.test(each.sql))!;
    assert.equal(/melody/i.test(levelRead.sql), false);
    assert.match(levelRead.sql, /owner_id/);
    assert.match(levelRead.sql, /status/);
    assert.deepEqual(levelRead.values, [ID]);
  });
});

describe("PUT /api/progress/:levelId", () => {
  const put = (body: unknown, answers?: readonly Answer[], headers?: Record<string, string>) =>
    send("PUT", `/api/progress/${ID}`, body, answers, headers);

  const saved = { elapsedMs: 5000, pitches: [{ index: 1, midi: 64 }], judged: [{ index: 1, midi: 64, correct: true }] };

  it("answers 401 before reading a byte of the body when nobody is signed in", async () => {
    const { response, asked } = await put("not even json", [level(rowOf())]);

    assert.equal(response.status, 401);
    assert.deepEqual(asked, []);
  });

  it("files the clock, the pitches and the verdicts under the account and the level, and says nothing back", async () => {
    const { response, asked } = await put(saved, [asOwner(), level(rowOf())], SIGNED_IN);

    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    const upsert = asked.at(-1)!;
    assert.match(upsert.sql, /INTO progress/i);
    assert.match(upsert.sql, /ON CONFLICT \(user_id, level_id\)/i);
    const [userId, levelId, elapsed, pitches, judged, updatedAt] = upsert.values;
    assert.equal(userId, OWNER_ID);
    assert.equal(levelId, ID);
    assert.equal(elapsed, 5000);
    assert.deepEqual(JSON.parse(pitches as string), saved.pitches);
    assert.deepEqual(JSON.parse(judged as string), saved.judged);
    assert.equal(typeof updatedAt, "number");
  });

  it("leaves the check count and the solve to the server, whatever the body claims", async () => {
    const { response, asked } = await put(
      { ...saved, checkCount: 99, solvedAt: 5 },
      [asOwner(), level(rowOf())],
      SIGNED_IN,
    );

    assert.equal(response.status, 204);
    const upsert = asked.at(-1)!;
    assert.equal(upsert.values.includes(99), false);
    assert.equal(upsert.values.includes(5), false);
    const set = upsert.sql.slice(upsert.sql.search(/DO UPDATE SET/i));
    assert.equal(/check_count\s*=/i.test(set), false);
    assert.equal(/solved_at\s*=/i.test(set), false);
    assert.match(upsert.sql, /VALUES \(\?, \?, \?, 0, NULL,/i);
  });

  it("keeps a solved row's pitches, since the page treats them as confirmed", async () => {
    const { asked } = await put(saved, [asOwner(), level(rowOf())], SIGNED_IN);

    assert.match(asked.at(-1)!.sql, /CASE WHEN solved_at IS NULL THEN excluded\.pitches ELSE pitches END/i);
  });

  it("stores whole milliseconds, since the page's clock is not", async () => {
    const { asked } = await put({ ...saved, elapsedMs: 1234.56 }, [asOwner(), level(rowOf())], SIGNED_IN);

    assert.equal(asked.at(-1)!.values[2], 1234);
  });

  it("refuses progress filed under another level", async () => {
    const { response, asked } = await put(
      { ...saved, levelId: OTHER_ID },
      [asOwner(), level(rowOf())],
      SIGNED_IN,
    );

    assert.equal(response.status, 400);
    assert.equal(progressStatements(asked).length, 0);
  });

  it("refuses a body that is not progress, and writes nothing", async () => {
    for (const body of [
      { ...saved, pitches: "sixty" },
      { ...saved, elapsedMs: -1 },
      { ...saved, judged: [{ index: 1, midi: 64 }] },
      { ...saved, pitches: [{ index: 1, midi: 200 }] },
      [],
    ]) {
      const { response, asked } = await put(body, [asOwner(), level(rowOf())], SIGNED_IN);
      assert.equal(response.status, 400, `accepted ${JSON.stringify(body)}`);
      assert.equal(progressStatements(asked).length, 0);
    }
  });

  it("refuses a body that is not JSON, and one too large to be progress", async () => {
    const notJson = await put("{ nope", [asOwner(), level(rowOf())], SIGNED_IN);
    assert.equal(notJson.response.status, 400);

    const huge = await put({ ...saved, padding: "a".repeat(70_000) }, [asOwner(), level(rowOf())], SIGNED_IN);
    assert.equal(huge.response.status, 413);
    assert.equal(progressStatements(huge.asked).length, 0);
  });

  it("answers 404 for a level that is not there or a draft not the viewer's, and writes nothing", async () => {
    const missing = await put(saved, [asOwner()], SIGNED_IN);
    const hidden = await put(saved, [asStranger(), level(DRAFT)], SIGNED_IN);

    assert.equal(missing.response.status, 404);
    assert.equal(hidden.response.status, 404);
    assert.equal(progressStatements(missing.asked).length, 0);
    assert.equal(progressStatements(hidden.asked).length, 0);
  });
});

describe("POST /api/progress/merge", () => {
  const merge = (body: unknown, answers?: readonly Answer[], headers?: Record<string, string>) =>
    send("POST", "/api/progress/merge", body, answers, headers);

  const inserted = (batches: readonly Asked[][]): Asked[] =>
    batches.flat().filter((each) => /INTO progress/i.test(each.sql));

  it("answers 401 before reading a byte of the body when nobody is signed in", async () => {
    const { response, asked } = await merge("not even json", [level(rowOf())]);

    assert.equal(response.status, 401);
    assert.deepEqual(asked, []);
  });

  it("takes the browser's record whole for a level the account has not played, and says which it took", async () => {
    const browser = record({
      elapsedMs: 60_000,
      checkCount: 3,
      solvedAt: 1_754_500_000_000,
      pitches: right,
      judged: [{ index: 2, midi: 65, correct: false }],
    });

    const { response, batches } = await merge({ records: [browser] }, [asOwner(), level(rowOf())], SIGNED_IN);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { taken: [ID] });
    const [write] = inserted(batches);
    const [userId, levelId, elapsed, checks, solvedAt, pitches, judged, updatedAt] = write!.values;
    assert.equal(userId, OWNER_ID);
    assert.equal(levelId, ID);
    assert.equal(elapsed, 60_000);
    assert.equal(checks, 3);
    assert.equal(solvedAt, 1_754_500_000_000);
    assert.deepEqual(JSON.parse(pitches as string), right);
    assert.deepEqual(JSON.parse(judged as string), [
      { index: 0, midi: 60, correct: true },
      { index: 1, midi: 64, correct: true },
      { index: 2, midi: 65, correct: false },
      { index: 2, midi: 67, correct: true },
      { index: 3, midi: 64, correct: true },
    ]);
    assert.equal(typeof updatedAt, "number");
  });

  it("re-grades the browser's record against the answer before believing a word of it", async () => {
    const liar = record({
      checkCount: 1,
      solvedAt: 1_754_500_000_000,
      pitches: [...right.slice(0, 3), { index: 3, midi: 65 }],
      judged: [{ index: 3, midi: 65, correct: true }],
    });

    const { response, batches } = await merge({ records: [liar] }, [asOwner(), level(rowOf())], SIGNED_IN);

    assert.equal(response.status, 200);
    const [write] = inserted(batches);
    const [, , , , solvedAt, , judged] = write!.values;
    assert.equal(solvedAt, null);
    assert.deepEqual(JSON.parse(judged as string), [{ index: 3, midi: 65, correct: false }]);
  });

  it("keeps the account's solve over the browser's partial record, and keeps the browser's verdicts", async () => {
    const account = progressRow({
      elapsed_ms: 30_000,
      check_count: 2,
      solved_at: 77,
      pitches: JSON.stringify(right),
      judged: JSON.stringify(right.map((pitch) => ({ ...pitch, correct: true }))),
    });
    const browser = record({
      elapsedMs: 90_000,
      checkCount: 9,
      pitches: [{ index: 1, midi: 62 }],
      judged: [{ index: 1, midi: 62, correct: false }],
    });

    const { response, batches } = await merge(
      { records: [browser] },
      [asOwner(), level(rowOf()), held(account)],
      SIGNED_IN,
    );

    assert.deepEqual(await response.json(), { taken: [ID] });
    const [write] = inserted(batches);
    const [, , elapsed, checks, solvedAt, pitches, judged] = write!.values;
    assert.equal(elapsed, 30_000);
    assert.equal(checks, 2);
    assert.equal(solvedAt, 77);
    assert.deepEqual(JSON.parse(pitches as string), right);
    assert.deepEqual(JSON.parse(judged as string), [
      { index: 0, midi: 60, correct: true },
      { index: 1, midi: 62, correct: false },
      { index: 1, midi: 64, correct: true },
      { index: 2, midi: 67, correct: true },
      { index: 3, midi: 64, correct: true },
    ]);
  });

  it("skips a level that is not there, and a draft that is not the viewer's, without saying so", async () => {
    const missing = await merge({ records: [record()] }, [asOwner()], SIGNED_IN);
    const hidden = await merge({ records: [record()] }, [asStranger(), level(DRAFT)], SIGNED_IN);

    for (const { response, batches, asked } of [missing, hidden]) {
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { taken: [] });
      assert.deepEqual(batches, []);
      assert.equal(asked.some((each) => /INTO progress/i.test(each.sql)), false);
    }
  });

  it("skips a level still missing pitches, which nothing could have been graded against", async () => {
    const { response, batches } = await merge(
      { records: [record()] },
      [asOwner(), level(rowOf({ status: "draft", published_at: null, unpitched_count: 2 }))],
      SIGNED_IN,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(batches, []);
  });

  it("merges the author's record on their own draft, asking who is asking only once", async () => {
    const { response, asked, batches } = await merge(
      { records: [record()] },
      [asOwner(), level(DRAFT)],
      SIGNED_IN,
    );

    assert.deepEqual(await response.json(), { taken: [ID] });
    assert.equal(asked.filter((each) => /FROM sessions/i.test(each.sql)).length, 1);
    assert.equal(inserted(batches).length, 1);
  });

  it("writes every taken record in one batch", async () => {
    const { response, batches } = await merge(
      { records: [record(), record({ levelId: OTHER_ID })] },
      [asOwner(), level(rowOf())],
      SIGNED_IN,
    );

    assert.deepEqual(await response.json(), { taken: [ID, OTHER_ID] });
    assert.equal(batches.length, 1);
    assert.deepEqual(
      batches[0]!.map((each) => each.values[1]),
      [ID, OTHER_ID],
    );
  });

  it("writes nothing for a record that changed the account's row not at all, but still calls it taken", async () => {
    const same = progressRow({
      elapsed_ms: 5000,
      check_count: 1,
      pitches: JSON.stringify([{ index: 1, midi: 64 }]),
      judged: JSON.stringify([{ index: 1, midi: 64, correct: true }]),
    });

    const { response, batches } = await merge(
      { records: [record()] },
      [asOwner(), level(rowOf()), held(same)],
      SIGNED_IN,
    );

    assert.deepEqual(await response.json(), { taken: [ID] });
    assert.deepEqual(batches, []);
  });

  it("refuses a body that is not a list of progress, one naming a level twice, and one with more than a hundred", async () => {
    const answers = [asOwner(), level(rowOf())];

    for (const body of [
      [],
      { records: "many" },
      { records: [{ levelId: ID }] },
      { records: [{ ...record(), levelId: "NOT-AN-ID" }] },
      { records: [record(), record()] },
    ]) {
      const { response, asked } = await merge(body, answers, SIGNED_IN);
      assert.equal(response.status, 400, `accepted ${JSON.stringify(body)}`);
      assert.equal(asked.some((each) => /transcriptions|progress/i.test(each.sql)), false);
    }

    const tooMany = await merge(
      { records: Array.from({ length: 101 }, (_unused, at) => record({ levelId: `${String(at).padStart(12, "0")}` })) },
      answers,
      SIGNED_IN,
    );
    assert.equal(tooMany.response.status, 413);
  });

  it("refuses a body too large to merge", async () => {
    const { response, asked } = await merge(
      { records: [record()], padding: "a".repeat(1_100_000) },
      [asOwner(), level(rowOf())],
      SIGNED_IN,
    );

    assert.equal(response.status, 413);
    assert.equal(asked.some((each) => /transcriptions|progress/i.test(each.sql)), false);
  });

  it("answers an empty list for an empty list, asking nothing but who is asking", async () => {
    const { response, asked } = await merge({ records: [] }, [asOwner()], SIGNED_IN);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { taken: [] });
    assert.equal(asked.length, 1);
  });
});
