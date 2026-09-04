import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encode } from "../dist/editor/codec.js";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent, Rest, UnpitchedNote } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { LIMITS } from "../dist/shared/transcription.js";
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
  boundColumns,
  errorOf,
  stubDatabase,
  type Answer,
  type Asked,
  type Row,
} from "./helpers/stub-database.js";

/** A row exactly as the migration shapes one. */
const ROW = {
  id: "k3m9x2p7qw4t",
  title: "Clair de lune",
  subtitle: "Debussy",
  instructions: "The opening phrase.",
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
  unpitched_count: 0,
  // A published row always has the author's word now: publishing requires
  // it, and 0006 gave the middle of the scale to any published before.
  difficulty_half: 5,
  // What the aggregate subselects answer for a level nobody has rated,
  // hearted or solved: SUM over no rows is NULL, the COUNTs zero.
  rating_count: 0,
  rating_halves: null,
  upvote_count: 0,
  solve_count: 0,
  owner_id: "7k2m9x4p3qwt",
  status: "published",
  published_at: 1_754_500_000_000,
  updated_at: 1_754_500_000_000,
  created_at: 1_754_500_000_000,
};

/** The level the statement that reads levels would find. */
const one = (row: Row): Answer => ({ when: /FROM transcriptions/iu, first: row });

/** The levels the listing would find. */
const list = (rows: readonly Row[]): Answer => ({
  when: /FROM transcriptions/iu,
  rows,
});

/** What was asked of the levels table, leaving aside who was asking. */
const touched = (asked: readonly Asked[]): Asked[] =>
  asked.filter((statement) => /transcriptions/iu.test(statement.sql));

const call = async (
  path: string,
  init: RequestInit = {},
  answers: readonly Answer[] = [],
  headers: Record<string, string> = {},
) => {
  const { asked, env } = stubDatabase(answers);
  const response = await api.request(
    path,
    { ...init, headers: { ...(init.headers as Record<string, string>), ...headers } },
    env,
  );
  return { response, asked };
};

const get = (
  path: string,
  answers?: readonly Answer[],
  headers?: Record<string, string>,
) => call(path, {}, answers, headers);

const remove = (
  path: string,
  answers?: readonly Answer[],
  headers?: Record<string, string>,
) => call(path, { method: "DELETE" }, answers, headers);

const send = (
  path: string,
  method: "POST" | "PUT",
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

// ---- melodies to submit --------------------------------------------------

const C4 = new Pitch("C", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const C_MAJOR = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;

const melodyOf = (events: readonly NoteEvent[]) =>
  new Melody(C_MAJOR, METER_4_4, events);

/** `count` quarter notes, which is `count / 4` bars of 4/4. */
const bars = (count: number) =>
  melodyOf(Array.from({ length: count }, () => new Note(C4, QUARTER)));

/**
 * A submission that would really be made.
 *
 * The marks span four seconds, which over the two bars of `bars(8)` is 120 to
 * the beat — a tempo, rather than a number that merely passes. The routes hold
 * marks to 10–600 BPM, so a fixture with a careless span would be refused for
 * a reason no test meant to be about.
 */
const submission = (over: Record<string, unknown> = {}) => ({
  details: { title: "Clair de lune", subtitle: "Debussy" },
  melody: JSON.parse(JSON.stringify(encode(bars(8)))),
  videoId: "dQw4w9WgXcQ",
  markStart: 12.5,
  markEnd: 16.5,
  clef: "treble",
  ...over,
});

describe("GET /api/tunes", () => {
  it("answers with an empty list when nothing has been submitted", async () => {
    const { response } = await get("/api/tunes");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });

  it("never asks the database for the melody, which is the answer", async () => {
    const { asked } = await get("/api/tunes");

    assert.equal(asked.length, 1);
    assert.equal(asked[0]!.sql.includes("melody"), false);
    assert.equal(asked[0]!.sql.includes("*"), false);
  });

  it("hands back no melody even when the row it read holds one", async () => {
    const { response } = await get("/api/tunes", [
      list([{ ...ROW, melody: JSON.stringify({ events: [{ pitch: "secret" }] }) }]),
    ]);

    const body = await response.text();
    assert.equal(body.includes("secret"), false);
    assert.equal(body.includes("melody"), false);
  });

  it("gives a level the shape the page expects", async () => {
    const { response } = await get("/api/tunes", [list([ROW])]);

    assert.deepEqual(await response.json(), [
      {
        id: "k3m9x2p7qw4t",
        title: "Clair de lune",
        subtitle: "Debussy",
        // Carried by the listing because the level's box is opened straight
        // from the card, and prose the author wrote is not the answer.
        instructions: "The opening phrase.",
        videoId: "dQw4w9WgXcQ",
        markStart: 12.5,
        markEnd: 44.25,
        measures: 16,
        clef: "treble",
        meter: { beats: 4, beatUnit: 4 },
        keyFifths: -5,
        keyMode: "major",
        noteCount: 41,
        unpitchedCount: 0,
        authorDifficulty: 2.5,
        ownerId: "7k2m9x4p3qwt",
        status: "published",
        publishedAt: 1_754_500_000_000,
        updatedAt: 1_754_500_000_000,
        createdAt: 1_754_500_000_000,
      },
    ]);
  });

  it("carries how much of a level is still unpitched", async () => {
    const { response } = await get("/api/tunes", [
      list([{ ...ROW, unpitched_count: 7 }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal(level!.unpitchedCount, 7);
  });

  it("leaves out a subtitle that was never given, rather than sending null", async () => {
    const { response } = await get("/api/tunes", [
      list([{ ...ROW, subtitle: null }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal("subtitle" in level!, false);
  });

  it("names the author beside every level, reading the name off the users table as the author would have it shown", async () => {
    const { response, asked } = await get("/api/tunes", [
      list([{ ...ROW, author: "quiet-heron" }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal(level!.author, "quiet-heron");
    // The name comes from users, and only when the author has not chosen to
    // be anonymous; the level row itself says nothing about either.
    assert.match(asked[0]!.sql, /FROM users/i);
    assert.match(asked[0]!.sql, /anonymous_author/i);
    assert.match(asked[0]!.sql, /AS author/i);
  });

  it("leaves out the author of a level whose author shows no name, rather than sending null", async () => {
    const { response } = await get("/api/tunes", [list([{ ...ROW, author: null }])]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal("author" in level!, false);
  });

  it("carries the author's difficulty in stars, from the halves the table holds, and leaves it out when unrated", async () => {
    const rated = await get("/api/tunes", [list([{ ...ROW, difficulty_half: 5 }])]);
    const [level] = (await rated.response.json()) as Record<string, unknown>[];
    assert.equal(level!.authorDifficulty, 2.5);

    const unrated = await get("/api/tunes", [list([{ ...ROW, difficulty_half: null }])]);
    const [plain] = (await unrated.response.json()) as Record<string, unknown>[];
    assert.equal("authorDifficulty" in plain!, false);
  });

  it("counts solvers' ratings beside every level, reading only accounts that share their play", async () => {
    const { response, asked } = await get("/api/tunes", [
      list([{ ...ROW, rating_count: 3, rating_halves: 13 }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal(level!.ratingCount, 3);
    assert.equal(level!.ratingHalves, 13);
    // The figures are aggregated at read time, honouring share_stats there:
    // nothing derived is stored, so an opt-out changes every figure at once.
    assert.match(asked[0]!.sql, /FROM ratings/i);
    assert.match(asked[0]!.sql, /share_stats = 1/i);
  });

  it("leaves the rating figures out of a level nobody has rated, rather than sending zeroes", async () => {
    const { response } = await get("/api/tunes", [
      list([{ ...ROW, rating_count: 0, rating_halves: null }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal("ratingCount" in level!, false);
    assert.equal("ratingHalves" in level!, false);
  });

  it("counts hearts and solvers beside every level, from accounts that share their play", async () => {
    const { response, asked } = await get("/api/tunes", [
      list([{ ...ROW, upvote_count: 4, solve_count: 9 }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal(level!.upvoteCount, 4);
    assert.equal(level!.solveCount, 9);
    assert.match(asked[0]!.sql, /FROM upvotes/i);
    assert.match(asked[0]!.sql, /FROM progress/i);
    // The author's own solves say nothing about the level, so the count
    // leaves them out; hearts and ratings never held the author's anyway.
    assert.match(asked[0]!.sql, /!= transcriptions\.owner_id/i);
  });

  it("leaves the hearts and solvers out of an unplayed level, rather than sending zeroes", async () => {
    const { response } = await get("/api/tunes", [
      list([{ ...ROW, upvote_count: 0, solve_count: 0 }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal("upvoteCount" in level!, false);
    assert.equal("solveCount" in level!, false);
  });

  it("asks for no more than a page of them, newest first", async () => {
    const { asked } = await get("/api/tunes");

    assert.match(asked[0]!.sql, /limit/i);
    assert.match(asked[0]!.sql, /order by created_at desc/i);
  });

  it("lists only what is published, and binds the word rather than spelling it in", async () => {
    const { asked } = await get("/api/tunes");

    assert.equal(asked.length, 1);
    assert.match(asked[0]!.sql, /where status = \?/i);
    assert.deepEqual(asked[0]!.values, ["published", 100]);
  });

  it("asks nobody who they are, since the listing is everybody's", async () => {
    const { asked } = await get("/api/tunes", [asOwner()], SIGNED_IN);

    assert.equal(asked.length, 1);
    assert.doesNotMatch(asked[0]!.sql, /sessions/i);
  });

  it("says when a level is the site's own, so its byline can read Admin", async () => {
    const { response } = await get("/api/tunes", [
      list([{ ...ROW, author: "quiet-heron", author_is_admin: 1 }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal(level!.authorIsAdmin, true);
  });

  it("drops an admin's name even from a row that somehow carries one", async () => {
    // The query already refuses to read it; this is the second gate, in the
    // spirit of the one that keeps the melody off a card. A widened SELECT
    // should still have nowhere to put an admin's username.
    const { response } = await get("/api/tunes", [
      list([{ ...ROW, author: "jason-the-admin", author_is_admin: 1 }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal("author" in level!, false);
    assert.equal(level!.authorIsAdmin, true);
    assert.equal(JSON.stringify(level).includes("jason-the-admin"), false);
  });

  it("says nothing at all about an ordinary author, rather than false", async () => {
    const { response } = await get("/api/tunes", [
      list([{ ...ROW, author: "quiet-heron", author_is_admin: 0 }]),
    ]);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal("authorIsAdmin" in level!, false);
  });
});

describe("GET /api/me/upvotes", () => {
  it("hands back the ids of the levels this account has hearted", async () => {
    const { response, asked } = await get(
      "/api/me/upvotes",
      [asOwner(), { when: /FROM upvotes/iu, rows: [{ level_id: "k3m9x2p7qw4t" }, { level_id: "2b4d6f8h0j1k" }] }],
      SIGNED_IN,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      levels: ["k3m9x2p7qw4t", "2b4d6f8h0j1k"],
    });
    // Read off this account's own rows, which the primary key already
    // orders: no join, and nothing about anybody else's hearts.
    const read = asked.find((statement) => /FROM upvotes/iu.test(statement.sql))!;
    assert.deepEqual(read.values, [OWNER_ID]);
    assert.doesNotMatch(read.sql, /join/i);
  });

  it("answers an empty list for an account that has hearted nothing", async () => {
    const { response } = await get("/api/me/upvotes", [asOwner()], SIGNED_IN);

    assert.deepEqual(await response.json(), { levels: [] });
  });

  it("refuses nobody in particular, since there is no such thing as their hearts", async () => {
    const { response, asked } = await get("/api/me/upvotes");

    assert.equal(response.status, 401);
    assert.equal(touched(asked).length, 0);
  });
});

describe("GET /api/mine", () => {
  it("answers 401 without asking the database when nobody is signed in", async () => {
    const { response, asked } = await get("/api/mine");

    assert.equal(response.status, 401);
    assert.equal(typeof (await errorOf(response)), "string");
    assert.deepEqual(asked, []);
  });

  it("lists the caller's levels, drafts and published alike, most recently touched first", async () => {
    const draft = { ...ROW, id: "aaaaaaaaaaaa", status: "draft", published_at: null };
    const { response, asked } = await get(
      "/api/mine",
      [asOwner(), list([draft, ROW])],
      SIGNED_IN,
    );

    assert.equal(response.status, 200);
    const levels = (await response.json()) as Record<string, unknown>[];
    assert.deepEqual(
      levels.map((level) => level.status),
      ["draft", "published"],
    );
    assert.match(asked.at(-1)!.sql, /where owner_id = \?/i);
    assert.match(asked.at(-1)!.sql, /order by updated_at desc/i);
    assert.equal(asked.at(-1)!.sql.includes("melody"), false);
  });

  it("asks only for the levels of the account the session named", async () => {
    const { asked } = await get("/api/mine", [asOwner()], SIGNED_IN);

    assert.deepEqual(asked.at(-1)!.values, [OWNER_ID, 100]);
  });

  it("leaves out publishedAt on a draft rather than sending null", async () => {
    const draft = { ...ROW, status: "draft", published_at: null };
    const { response } = await get("/api/mine", [asOwner(), list([draft])], SIGNED_IN);

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal("publishedAt" in level!, false);
    assert.equal(level!.status, "draft");
  });
});

describe("POST /api/tunes", () => {
  it("takes a whole transcription and answers with its id", async () => {
    const { response, asked } = await send("/api/tunes", "POST", submission(), [asOwner()], SIGNED_IN);

    assert.equal(response.status, 201);
    const { id } = (await response.json()) as { id: string };
    assert.match(id, /^[0-9abcdefghjkmnpqrstvwxyz]{12}$/);
    assert.equal(asked.length, 2);
    assert.match(asked.at(-1)!.sql, /insert into transcriptions/i);
  });

  it("counts the notes itself rather than believing the request", async () => {
    // Eight quarter notes is eight notes, whatever the body says about it.
    const { asked } = await send(
      "/api/tunes",
      "POST",
      submission({ noteCount: 2, unpitchedCount: 99, measures: 1 }),
      [asOwner()],
      SIGNED_IN,
    );

    const bound = boundColumns(asked.at(-1)!.sql, asked.at(-1)!.values);
    assert.equal(bound.note_count, 8);
    assert.equal(bound.unpitched_count, 0);
    assert.equal(bound.measures, 2);
  });

  it("takes the meter and the key off the melody, not off the request", async () => {
    const { asked } = await send(
      "/api/tunes",
      "POST",
      submission({ meter: { beats: 7, beatUnit: 8 }, keyFifths: 6 }),
      [asOwner()],
      SIGNED_IN,
    );

    const bound = boundColumns(asked.at(-1)!.sql, asked.at(-1)!.values);
    assert.equal(bound.meter_beats, 4);
    assert.equal(bound.meter_unit, 4);
    assert.equal(bound.key_fifths, 0);
    assert.equal(bound.key_mode, "major");
  });

  it("counts a note still awaiting a pitch, and says how many", async () => {
    const melody = melodyOf([
      new Note(C4, QUARTER),
      new UnpitchedNote(QUARTER),
      new UnpitchedNote(QUARTER),
      new Rest(QUARTER),
    ]);
    const { asked } = await send(
      "/api/tunes",
      "POST",
      submission({ melody: JSON.parse(JSON.stringify(encode(melody))) }),
      [asOwner()],
      SIGNED_IN,
    );

    const bound = boundColumns(asked.at(-1)!.sql, asked.at(-1)!.values);
    assert.equal(bound.note_count, 3);
    assert.equal(bound.unpitched_count, 2);
  });

  it("refuses a melody of fewer than two notes, and says why", async () => {
    const { response, asked } = await send(
      "/api/tunes",
      "POST",
      submission({ melody: JSON.parse(JSON.stringify(encode(bars(1)))) }),
      [asOwner()],
      SIGNED_IN,
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /two notes/i);
    // Nothing was written; the CHECK constraint is a backstop, not the message.
    assert.deepEqual(touched(asked), []);
  });

  it("refuses details the panel would have refused too", async () => {
    for (const details of [
      // Read off the limit rather than restated, so raising the cap does not
      // quietly turn this into a test of nothing.
      { title: "a".repeat(LIMITS.title.max + 1) },
      { title: "   " },
      { title: "Clair\nde lune" },
      { title: 42 },
      {},
    ]) {
      const { response, asked } = await send(
        "/api/tunes",
        "POST",
        submission({ details }),
        [asOwner()],
        SIGNED_IN,
      );
      assert.equal(response.status, 400, `took ${JSON.stringify(details)}`);
      assert.equal(typeof (await errorOf(response)), "string");
      assert.deepEqual(touched(asked), []);
    }
  });

  it("refuses a melody that is not one", async () => {
    const wrong = JSON.parse(JSON.stringify(encode(bars(8))));
    wrong.key.letter = "H";

    const { response, asked } = await send(
      "/api/tunes",
      "POST",
      submission({ melody: wrong }),
      [asOwner()],
      SIGNED_IN,
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /melody/i);
    assert.deepEqual(touched(asked), []);
  });

  it("refuses a key the stave could not print", async () => {
    // B-sharp major is twelve fifths out; the column stops at seven, and
    // alterationFor() throws past a double accidental.
    const melody = new Melody(
      new KeySignature(new Pitch("B", 1, 4), "major"),
      METER_4_4,
      Array.from({ length: 8 }, () => new Note(C4, QUARTER)),
    );

    const { response, asked } = await send(
      "/api/tunes",
      "POST",
      submission({ melody: JSON.parse(JSON.stringify(encode(melody))) }),
      [asOwner()],
      SIGNED_IN,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(touched(asked), []);
  });

  it("refuses a video id that is not one, and marks that describe no section", async () => {
    for (const over of [
      { videoId: "" },
      { videoId: "https://youtu.be/dQw4w9WgXcQ" },
      { videoId: "dQw4w9WgXc" },
      { markStart: -1 },
      { markEnd: 12.5 },
      { markEnd: 0 },
      { markEnd: 0 },
      { markStart: "12.5" },
      { markStart: Number.NaN },
      { clef: "alto" },
      { clef: undefined },
    ]) {
      const { response, asked } = await send(
        "/api/tunes",
        "POST",
        submission(over),
        [asOwner()],
        SIGNED_IN,
      );
      assert.equal(response.status, 400, `took ${JSON.stringify(over)}`);
      assert.deepEqual(touched(asked), []);
    }
  });

  it("refuses a body that is not JSON at all", async () => {
    const { response, asked } = await send("/api/tunes", "POST", "not json", [asOwner()], SIGNED_IN);

    assert.equal(response.status, 400);
    assert.deepEqual(touched(asked), []);
  });

  it("refuses a body too large to be a transcription", async () => {
    const huge = { ...submission(), instructions: "a".repeat(200_000) };

    const { response, asked } = await send("/api/tunes", "POST", huge, [asOwner()], SIGNED_IN);

    assert.equal(response.status, 413);
    assert.deepEqual(touched(asked), []);
  });

  it("turns away a signed-out author before reading a byte of the body", async () => {
    // A body of nonsense would be a 400 from anybody signed in. Signed out, it
    // is 401 before it is looked at: the remedy is the same whatever it holds.
    const { response, asked } = await send("/api/tunes", "POST", "not json");

    assert.equal(response.status, 401);
    assert.match(await errorOf(response), /sign in/i);
    assert.deepEqual(asked, []);
  });

  it("saves a new transcription as a draft owned by whoever is signed in", async () => {
    const { asked } = await send(
      "/api/tunes",
      "POST",
      submission({ ownerId: STRANGER_ID, status: "published" }),
      [asOwner()],
      SIGNED_IN,
    );

    const bound = boundColumns(asked.at(-1)!.sql, asked.at(-1)!.values);
    assert.equal(bound.owner_id, OWNER_ID);
    assert.equal(bound.status, "draft");
    assert.equal("published_at" in bound, false);
  });

  it("stores the difficulty as a count of halves, and none as NULL", async () => {
    const rated = await send(
      "/api/tunes", "POST",
      submission({ details: { title: "Clair de lune", difficulty: 2.5 } }),
      [asOwner()], SIGNED_IN,
    );
    assert.equal(rated.response.status, 201);
    const bound = boundColumns(rated.asked.at(-1)!.sql, rated.asked.at(-1)!.values);
    assert.equal(bound.difficulty_half, 5);

    const unrated = await send("/api/tunes", "POST", submission(), [asOwner()], SIGNED_IN);
    const plain = boundColumns(unrated.asked.at(-1)!.sql, unrated.asked.at(-1)!.values);
    assert.equal(plain.difficulty_half, null);
  });

  it("refuses a difficulty that is not half a star to five in halves", async () => {
    for (const difficulty of [0, 6, 2.25, "3"]) {
      const { response, asked } = await send(
        "/api/tunes", "POST",
        submission({ details: { title: "Clair de lune", difficulty } }),
        [asOwner()], SIGNED_IN,
      );
      assert.equal(response.status, 400, `accepted ${String(difficulty)}`);
      assert.match(await errorOf(response), /difficulty/i);
      assert.equal(asked.some((each) => /insert/i.test(each.sql)), false);
    }
  });

  it("dates updated_at from the same moment as created_at", async () => {
    const { asked } = await send("/api/tunes", "POST", submission(), [asOwner()], SIGNED_IN);

    const bound = boundColumns(asked.at(-1)!.sql, asked.at(-1)!.values);
    assert.equal(typeof bound.created_at, "number");
    assert.equal(bound.updated_at, bound.created_at);
  });

  it("keeps the video, the marks and the clef the request gave", async () => {
    // These four are the only things it may not work out for itself.
    const { asked } = await send("/api/tunes", "POST", submission(), [asOwner()], SIGNED_IN);

    const bound = boundColumns(asked.at(-1)!.sql, asked.at(-1)!.values);
    assert.equal(bound.video_id, "dQw4w9WgXcQ");
    assert.equal(bound.mark_start, 12.5);
    assert.equal(bound.mark_end, 16.5);
    assert.equal(bound.clef, "treble");
  });
});

describe("GET /api/tunes/:id/source", () => {
  it("hands over the melody, since this is the route that is meant to", async () => {
    const melody = JSON.parse(JSON.stringify(encode(bars(8))));
    const { response } = await get("/api/tunes/k3m9x2p7qw4t/source", [
      asOwner(),
      one({ ...ROW, melody: JSON.stringify(melody) }),
    ],
    SIGNED_IN);

    assert.equal(response.status, 200);
    const record = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(record.melody, melody);
    assert.equal(record.instructions, "The opening phrase.");
  });

  it("turns away an id that could not be one, without asking the database", async () => {
    // Ids arrive in URLs. Every query binds its values, so a strange one is
    // harmless — but there is nothing to look up, so nothing is looked up.
    for (const id of ["nope", "AAAAAAAAAAAA", "..%2F..%2Fetc"]) {
      const { response, asked } = await get(`/api/tunes/${id}/source`);
      assert.equal(response.status, 404, `looked up ${id}`);
      assert.deepEqual(asked, []);
    }
  });

  it("says so plainly when there is no such level", async () => {
    const { response } = await get("/api/tunes/k3m9x2p7qw4t/source", [asOwner()], SIGNED_IN);

    assert.equal(response.status, 404);
    assert.equal(typeof (await errorOf(response)), "string");
  });

  it("answers 401 when nobody is signed in, whatever the id, and looks nothing up", async () => {
    const { response, asked } = await get("/api/tunes/k3m9x2p7qw4t/source", [
      one({ ...ROW, melody: "{}" }),
    ]);

    assert.equal(response.status, 401);
    assert.deepEqual(asked, []);
  });

  it("answers 403 to a stranger asking for a published level's source", async () => {
    const { response } = await get(
      "/api/tunes/k3m9x2p7qw4t/source",
      [asStranger(), one({ ...ROW, melody: "{}" })],
      SIGNED_IN,
    );

    assert.equal(response.status, 403);
    assert.match(await errorOf(response), /author/i);
  });

  it("tells a stranger a draft is not there rather than that it is not theirs", async () => {
    const { response } = await get(
      "/api/tunes/k3m9x2p7qw4t/source",
      [asStranger(), one({ ...ROW, status: "draft", published_at: null, melody: "{}" })],
      SIGNED_IN,
    );

    assert.equal(response.status, 404);
    assert.equal(await errorOf(response), "There is no tune at that address.");
  });

  it("hands an admin anybody's", async () => {
    const { response } = await get(
      "/api/tunes/k3m9x2p7qw4t/source",
      [asAdmin(), one({ ...ROW, status: "draft", published_at: null, melody: "{}" })],
      SIGNED_IN,
    );

    assert.equal(response.status, 200);
  });
});

describe("PUT /api/tunes/:id", () => {
  // Eight quarter notes is two bars of 4/4, so the row has to say two — an
  // edit whose melody is a different length from the stored one is refused,
  // which would make every test below pass without reaching the UPDATE.
  const stored = {
    ...ROW,
    status: "draft",
    published_at: null,
    measures: 2,
    melody: JSON.stringify(encode(bars(8))),
  };
  const edit = { details: { title: "Clair de lune" }, melody: submission().melody };

  it("writes the melody and the details over the ones stored", async () => {
    const { response, asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      edit,
      [asOwner(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 200);
    assert.match(asked.at(-1)!.sql, /update transcriptions/i);
  });

  it("cannot be made to change the clef or the video", async () => {
    // They are not in the body at all, which is what makes them immutable --
    // the editor merely agrees with this, rather than being what enforces it.
    const { response, asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      { ...edit, clef: "bass", videoId: "aaaaaaaaaaa" },
      [asOwner(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 200);
    const update = asked.at(-1)!.sql;
    assert.match(update, /update transcriptions/i);
    for (const column of ["clef", "video_id"]) {
      assert.equal(update.includes(column), false, `update touched ${column}`);
    }
  });

  it("moves the marks, which are the one thing an edit may re-settle", async () => {
    // The first guess at where bar one starts is made against a video nobody
    // has transcribed yet, so it is the thing most worth being able to fix.
    const { response, asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      { ...edit, markStart: 13.25, markEnd: 45 },
      [asOwner(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 200);
    const update = asked.at(-1)!;
    assert.match(update.sql, /mark_start/);
    assert.match(update.sql, /mark_end/);
    assert.equal(update.values.includes(13.25), true);
    assert.equal(update.values.includes(45), true);
  });

  it("leaves the marks alone when an edit does not mention them", async () => {
    const { response, asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      edit,
      [asOwner(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 200);
    const update = asked.at(-1)!;
    assert.equal(update.values.includes(stored.mark_start), true);
    assert.equal(update.values.includes(stored.mark_end), true);
  });

  it("refuses marks that describe no section", async () => {
    for (const over of [
      { markStart: -1, markEnd: 4 },
      { markStart: 4, markEnd: 4 },
      { markStart: 4, markEnd: 1 },
      { markStart: "13", markEnd: 45 },
      { markStart: 13, markEnd: Number.NaN },
    ]) {
      const { response } = await send(
        "/api/tunes/k3m9x2p7qw4t",
        "PUT",
        { ...edit, ...over },
        [asOwner(), one(stored)], SIGNED_IN,
      );
      assert.equal(response.status, 400, `took ${JSON.stringify(over)}`);
    }
  });

  it("refuses a melody of a different length from the one stored", async () => {
    // The bar count was chosen against the video's marks. A melody of another
    // length would leave those marks measuring something else.
    const { response } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      { ...edit, melody: JSON.parse(JSON.stringify(encode(bars(12)))) },
      [asOwner(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /bar/i);
  });

  it("refuses a melody in a different meter from the one stored", async () => {
    const melody = new Melody(
      C_MAJOR,
      { beats: 3, beatUnit: 4 },
      Array.from({ length: 6 }, () => new Note(C4, QUARTER)),
    );

    const { response } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      { ...edit, melody: JSON.parse(JSON.stringify(encode(melody))) },
      [asOwner(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 400);
  });

  it("says so when there is no such level, and writes nothing", async () => {
    const { response, asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      edit,
      [asOwner()],
      SIGNED_IN,
    );

    assert.equal(response.status, 404);
    assert.equal(
      asked.some((statement) => /update/i.test(statement.sql)),
      false,
    );
  });

  it("holds an edit to the same rules as a submission", async () => {
    const { response } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      { ...edit, details: { title: "" } },
      [asOwner(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 400);
  });

  it("holds a draft to sending its melody, as a submission is", async () => {
    const { response, asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      { details: { title: "Clair de lune" } },
      [asOwner(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /melody/i);
    assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
  });

  it("stamps updated_at on a draft edit", async () => {
    const { asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      edit,
      [asOwner(), one(stored)], SIGNED_IN,
    );

    const update = asked.at(-1)!;
    assert.match(update.sql, /updated_at = \?/i);
    assert.equal(update.values.some((value) => typeof value === "number" && value > 1_700_000_000_000), true);
  });

  it("answers 401 before reading the body when nobody is signed in", async () => {
    const { response, asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      "not json",
      [one(stored)],
    );

    assert.equal(response.status, 401);
    assert.deepEqual(asked, []);
  });

  it("refuses a stranger's edit to a published level with 403, and writes nothing", async () => {
    const published = { ...stored, status: "published", published_at: 1 };
    const { response, asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      edit,
      [asStranger(), one(published)], SIGNED_IN,
    );

    assert.equal(response.status, 403);
    assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
  });

  it("hides a draft from a stranger as 404", async () => {
    const { response, asked } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      edit,
      [asStranger(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 404);
    assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
  });

  it("lets an admin edit a level that is not theirs", async () => {
    const { response } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      edit,
      [asAdmin(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 200);
  });

  describe("on a published level", () => {
    const published = { ...stored, status: "published", published_at: 1 };
    // The melody the row holds, sent back exactly as it is.
    const sameMelody = JSON.parse(stored.melody);

    it("takes new details and writes nothing but them", async () => {
      const { response, asked } = await send(
        "/api/tunes/k3m9x2p7qw4t",
        "PUT",
        { details: { title: "Clair de lune", subtitle: "Debussy", difficulty: 2.5 }, melody: sameMelody },
        [asOwner(), one(published)], SIGNED_IN,
      );

      assert.equal(response.status, 200);
      const update = asked.at(-1)!;
      assert.match(update.sql, /update transcriptions/i);
      assert.match(update.sql, /updated_at/);
      for (const column of ["melody", "mark_start", "mark_end", "key_fifths", "note_count"]) {
        assert.equal(update.sql.includes(column), false, `update touched ${column}`);
      }
      assert.equal(update.values.includes("Debussy"), true);
    });

    it("takes the words alone, with no melody sent, and writes nothing but them", async () => {
      // The details box edits a published level without ever opening the
      // editor, so it has no melody to send back; not sending one means the
      // music is unchanged.
      const { response, asked } = await send(
        "/api/tunes/k3m9x2p7qw4t",
        "PUT",
        { details: { title: "Renamed", subtitle: "Debussy", difficulty: 2.5 } },
        [asOwner(), one(published)], SIGNED_IN,
      );

      assert.equal(response.status, 200);
      const update = asked.at(-1)!;
      assert.match(update.sql, /update transcriptions/i);
      assert.equal(update.sql.includes("melody"), false);
      assert.equal(update.values.includes("Renamed"), true);
    });

    it("takes a new difficulty as one of the words, since it is the author's to change", async () => {
      const { response, asked } = await send(
        "/api/tunes/k3m9x2p7qw4t",
        "PUT",
        { details: { title: "Clair de lune", subtitle: "Debussy", difficulty: 4 } },
        [asOwner(), one(published)], SIGNED_IN,
      );

      assert.equal(response.status, 200);
      const update = asked.at(-1)!;
      assert.match(update.sql, /difficulty_half = \?/i);
      assert.equal(update.values.includes(8), true);
    });

    it("does not mind the melody being sent back unchanged, however its JSON is ordered", async () => {
      // The editor always sends the melody. What matters is whether the music
      // changed, not whether it was mentioned -- and the codec's canonical
      // form is what the comparison reads, so key order is nothing.
      const reordered = { tuplets: [], ties: [], events: sameMelody.events, meter: sameMelody.meter, key: sameMelody.key };
      const { response } = await send(
        "/api/tunes/k3m9x2p7qw4t",
        "PUT",
        { details: { title: "Renamed", difficulty: 2.5 }, melody: reordered },
        [asOwner(), one(published)], SIGNED_IN,
      );

      assert.equal(response.status, 200);
    });

    it("refuses to change the music, and says to unpublish it first", async () => {
      const changed = JSON.parse(JSON.stringify(encode(bars(8))));
      changed.events[3].pitch.letter = "E";

      const { response, asked } = await send(
        "/api/tunes/k3m9x2p7qw4t",
        "PUT",
        { details: { title: "Clair de lune" }, melody: changed },
        [asOwner(), one(published)], SIGNED_IN,
      );

      assert.equal(response.status, 409);
      assert.match(await errorOf(response), /unpublish/i);
      assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
    });

    it("refuses to move the marks", async () => {
      const { response, asked } = await send(
        "/api/tunes/k3m9x2p7qw4t",
        "PUT",
        { details: { title: "Clair de lune" }, melody: sameMelody, markStart: 13, markEnd: 45 },
        [asOwner(), one(published)], SIGNED_IN,
      );

      assert.equal(response.status, 409);
      assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
    });

    it("leaves the marks alone when an edit does not mention them, as for a draft", async () => {
      const { response } = await send(
        "/api/tunes/k3m9x2p7qw4t",
        "PUT",
        { details: { title: "Clair de lune", difficulty: 2.5 }, melody: sameMelody },
        [asOwner(), one(published)], SIGNED_IN,
      );

      assert.equal(response.status, 200);
    });

    it("refuses to clear the difficulty of a published level", async () => {
      const { response, asked } = await send(
        "/api/tunes/k3m9x2p7qw4t",
        "PUT",
        { details: { title: "Clair de lune" }, melody: sameMelody },
        [asOwner(), one(published)], SIGNED_IN,
      );

      assert.equal(response.status, 409);
      assert.match(await errorOf(response), /difficulty/i);
      assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
    });
  });
});

describe("DELETE /api/tunes/:id", () => {
  it("removes the level and says nothing back", async () => {
    const { response, asked } = await remove("/api/tunes/k3m9x2p7qw4t", [asOwner(), one(ROW)], SIGNED_IN);

    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assert.match(asked.at(-1)!.sql, /DELETE FROM transcriptions/);
  });

  it("names the row to delete by binding it, never by splicing it", async () => {
    // The id arrives in a URL, so the one thing that must never happen is for
    // it to reach the statement as text.
    const { asked } = await remove("/api/tunes/k3m9x2p7qw4t", [asOwner(), one(ROW)], SIGNED_IN);

    const statement = asked.at(-1)!;
    assert.equal(statement.sql.includes("k3m9x2p7qw4t"), false);
    assert.deepEqual(statement.values, ["k3m9x2p7qw4t"]);
  });

  it("deletes the level alone, leaving its progress to the cascade", async () => {
    const { asked } = await remove("/api/tunes/k3m9x2p7qw4t", [asOwner(), one(ROW)], SIGNED_IN);

    assert.equal(asked.some((each) => /progress/i.test(each.sql)), false);
  });

  it("turns away an id that could not be one, without asking the database", async () => {
    for (const id of ["nope", "AAAAAAAAAAAA", "..%2F..%2Fetc"]) {
      const { response, asked } = await remove(`/api/tunes/${id}`);
      assert.equal(response.status, 404, `looked up ${id}`);
      assert.deepEqual(asked, []);
    }
  });

  it("says so plainly when there is no such level, and deletes nothing", async () => {
    // Answering 204 either way would be simpler and would say that a mistyped
    // address had done something.
    const { response, asked } = await remove("/api/tunes/k3m9x2p7qw4t", [asOwner()], SIGNED_IN);

    assert.equal(response.status, 404);
    assert.equal(typeof (await errorOf(response)), "string");
    assert.equal(
      asked.some((statement) => /DELETE/.test(statement.sql)),
      false,
    );
  });
});

describe("DELETE /api/tunes/:id, now that levels are somebody's", () => {
  const draft = { ...ROW, status: "draft", published_at: null };

  it("lets the author delete their level, draft or published, and an admin anybody's", async () => {
    for (const [who, row] of [
      [asOwner(), ROW],
      [asOwner(), draft],
      [asAdmin(), ROW],
      [asAdmin(), draft],
    ] as const) {
      const { response, asked } = await remove("/api/tunes/k3m9x2p7qw4t", [who, one(row)], SIGNED_IN);
      assert.equal(response.status, 204);
      assert.match(asked.at(-1)!.sql, /DELETE FROM transcriptions/);
    }
  });

  it("answers 401 signed out, 403 to a stranger on a published level, 404 on a draft", async () => {
    const signedOut = await remove("/api/tunes/k3m9x2p7qw4t", [one(ROW)]);
    assert.equal(signedOut.response.status, 401);
    assert.deepEqual(signedOut.asked, []);

    const stranger = await remove("/api/tunes/k3m9x2p7qw4t", [asStranger(), one(ROW)], SIGNED_IN);
    assert.equal(stranger.response.status, 403);

    const hidden = await remove("/api/tunes/k3m9x2p7qw4t", [asStranger(), one(draft)], SIGNED_IN);
    assert.equal(hidden.response.status, 404);

    for (const { asked } of [stranger, hidden]) {
      assert.equal(asked.some((statement) => /DELETE/.test(statement.sql)), false);
    }
  });
});

describe("POST /api/tunes/:id/publish", () => {
  const draft = { ...ROW, status: "draft", published_at: null };
  const publish = (answers: readonly Answer[], headers?: Record<string, string>) =>
    call("/api/tunes/k3m9x2p7qw4t/publish", { method: "POST" }, answers, headers);

  it("publishes a finished draft, stamping published_at and updated_at from one moment", async () => {
    const { response, asked } = await publish([asOwner(), one(draft)], SIGNED_IN);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: "k3m9x2p7qw4t" });
    const update = asked.at(-1)!;
    assert.match(update.sql, /update transcriptions/i);
    assert.match(update.sql, /status = \?/i);
    const [status, publishedAt, updatedAt, id, was] = update.values;
    assert.equal(status, "published");
    assert.equal(typeof publishedAt, "number");
    assert.equal(updatedAt, publishedAt);
    assert.equal(id, "k3m9x2p7qw4t");
    // Compare-and-set: a second publish racing this one changes nothing.
    assert.equal(was, "draft");
  });

  it("refuses a draft still missing pitches, and says why", async () => {
    const { response, asked } = await publish(
      [asOwner(), one({ ...draft, unpitched_count: 3 })],
      SIGNED_IN,
    );

    assert.equal(response.status, 409);
    assert.match(await errorOf(response), /pitch/i);
    assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
  });

  it("refuses to publish a draft nobody has rated, and says why", async () => {
    const { response, asked } = await publish(
      [asOwner(), one({ ...draft, difficulty_half: null })],
      SIGNED_IN,
    );

    assert.equal(response.status, 409);
    assert.match(await errorOf(response), /difficulty/i);
    assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
  });

  it("refuses a level that is already published", async () => {
    const { response, asked } = await publish([asOwner(), one(ROW)], SIGNED_IN);

    assert.equal(response.status, 409);
    assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
  });

  it("is the author's or an admin's to do, and nobody else's", async () => {
    assert.equal((await publish([asAdmin(), one(draft)], SIGNED_IN)).response.status, 200);
    assert.equal((await publish([asStranger(), one(draft)], SIGNED_IN)).response.status, 404);
    assert.equal((await publish([one(draft)])).response.status, 401);
  });

  it("turns away an id that could not be one, without asking the database", async () => {
    const { response, asked } = await call("/api/tunes/nope/publish", { method: "POST" }, [asOwner()], SIGNED_IN);

    assert.equal(response.status, 404);
    assert.deepEqual(asked, []);
  });
});

describe("POST /api/tunes/:id/unpublish", () => {
  const unpublish = (answers: readonly Answer[], headers?: Record<string, string>) =>
    call("/api/tunes/k3m9x2p7qw4t/unpublish", { method: "POST" }, answers, headers);

  it("turns a published level back into a draft under a new id, and says which", async () => {
    const { response, asked } = await unpublish([asOwner(), one(ROW)], SIGNED_IN);

    assert.equal(response.status, 200);
    const { id } = (await response.json()) as { id: string };
    assert.match(id, /^[0-9abcdefghjkmnpqrstvwxyz]{12}$/);
    assert.notEqual(id, "k3m9x2p7qw4t");

    const update = asked.at(-1)!;
    assert.match(update.sql, /update transcriptions/i);
    assert.match(update.sql, /set id = \?/i);
    assert.equal(update.values[0], id);
    assert.equal(update.values.includes("draft"), true);
  });

  it("clears published_at and binds both ids, splicing neither", async () => {
    const { response, asked } = await unpublish([asOwner(), one(ROW)], SIGNED_IN);
    const { id } = (await response.json()) as { id: string };

    const update = asked.at(-1)!;
    assert.match(update.sql, /published_at = NULL/i);
    assert.equal(update.sql.includes(id), false);
    assert.equal(update.sql.includes("k3m9x2p7qw4t"), false);
    assert.equal(update.values.includes("k3m9x2p7qw4t"), true);
    // Compare-and-set, as for publishing.
    assert.equal(update.values.at(-1), "published");
  });

  it("refuses a level that is not published", async () => {
    const { response, asked } = await unpublish(
      [asOwner(), one({ ...ROW, status: "draft", published_at: null })],
      SIGNED_IN,
    );

    assert.equal(response.status, 409);
    assert.equal(asked.some((statement) => /update/i.test(statement.sql)), false);
  });

  it("is the author's or an admin's to do, and nobody else's", async () => {
    assert.equal((await unpublish([asAdmin(), one(ROW)], SIGNED_IN)).response.status, 200);
    assert.equal((await unpublish([asStranger(), one(ROW)], SIGNED_IN)).response.status, 403);
    assert.equal((await unpublish([one(ROW)])).response.status, 401);
  });

  it("forgets every player's progress before moving the id, in one batch with the deletes first", async () => {
    const { response, asked, batches } = await unpublishBatched([asOwner(), one(ROW)], SIGNED_IN);

    assert.equal(response.status, 200);
    assert.equal(batches.length, 1);
    const [forget, , , update] = batches[0]!;
    assert.match(forget!.sql, /DELETE FROM progress/i);
    assert.match(update!.sql, /UPDATE transcriptions/i);
    // Nothing outside the batch touches any of the four tables.
    assert.equal(
      asked.filter((each) => /progress|ratings|upvotes|UPDATE/i.test(each.sql)).length,
      4,
    );
  });

  it("forgets every rating and every upvote with the progress, in the same batch", async () => {
    const { batches } = await unpublishBatched([asOwner(), one(ROW)], SIGNED_IN);

    assert.match(batches[0]!.at(1)!.sql, /DELETE FROM ratings/i);
    assert.match(batches[0]!.at(2)!.sql, /DELETE FROM upvotes/i);
  });

  it("binds the old id to the deletes and splices nothing", async () => {
    const { batches } = await unpublishBatched([asOwner(), one(ROW)], SIGNED_IN);

    for (const forget of batches[0]!.slice(0, 3)) {
      assert.equal(forget.sql.includes("k3m9x2p7qw4t"), false);
      assert.deepEqual(forget.values, ["k3m9x2p7qw4t"]);
    }
  });

  it("batches nothing when it refuses", async () => {
    const { response, batches } = await unpublishBatched(
      [asOwner(), one({ ...ROW, status: "draft", published_at: null })],
      SIGNED_IN,
    );

    assert.equal(response.status, 409);
    assert.deepEqual(batches, []);
  });
});

/** Unpublish, with the batches the stand-in saw. */
async function unpublishBatched(
  answers: readonly Answer[],
  headers: Record<string, string> = {},
) {
  const { asked, batches, env } = stubDatabase(answers);
  const response = await api.request(
    "/api/tunes/k3m9x2p7qw4t/unpublish",
    { method: "POST", headers },
    env,
  );
  return { response, asked, batches };
}

describe("the api's edges", () => {
  it("answers an unknown api path with JSON, never a page", async () => {
    const { response } = await get("/api/nonsense");

    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(typeof (await errorOf(response)), "string");
  });

  it("refuses to let a response be taken for a type it is not", async () => {
    const { response } = await get("/api/tunes");

    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  });
});

describe("the tempo the marks imply", () => {
  // A draft, since a published level's marks cannot move at all.
  const stored = {
    ...ROW,
    status: "draft",
    published_at: null,
    measures: 2,
    melody: JSON.stringify(encode(bars(8))),
  };

  it("is refused when it is faster than music goes", async () => {
    // Two bars of 4/4 is eight beats; over a fifth of a second that is well
    // past 600, and a metronome asked for it would click ten times a second.
    const { response, asked } = await send(
      "/api/tunes",
      "POST",
      submission({ markStart: 0, markEnd: 0.2 }),
      [asOwner()],
      SIGNED_IN,
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /BPM/);
    assert.deepEqual(touched(asked), []);
  });

  it("is refused when it is slower than music goes", async () => {
    const { response } = await send(
      "/api/tunes",
      "POST",
      submission({ markStart: 0, markEnd: 600 }),
      [asOwner()],
      SIGNED_IN,
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /BPM/);
  });

  it("is held to the same bounds when an edit moves the marks", async () => {
    const { response } = await send(
      "/api/tunes/k3m9x2p7qw4t",
      "PUT",
      {
        details: { title: "Clair de lune" },
        melody: submission().melody,
        markStart: 0,
        markEnd: 0.2,
      },
      [asOwner(), one(stored)], SIGNED_IN,
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /BPM/);
  });

  it("counts the felt beat, so a compound meter is not called too fast", async () => {
    // Two bars of 6/8 is four felt beats, not twelve. Counting the written
    // ones would put this at three times the tempo it is.
    const melody = new Melody(
      C_MAJOR,
      { beats: 6, beatUnit: 8 },
      Array.from({ length: 12 }, () => new Note(C4, new Duration(NoteValue.Eighth))),
    );

    const { response } = await send(
      "/api/tunes",
      "POST",
      submission({
        melody: JSON.parse(JSON.stringify(encode(melody))),
        markStart: 0,
        // Four felt beats across two seconds is 120; twelve would be 360.
        markEnd: 2,
      }),
      [asOwner()],
      SIGNED_IN,
    );

    assert.equal(response.status, 201);
  });
});
