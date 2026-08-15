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

type Row = Record<string, unknown>;

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
  created_at: 1_754_500_000_000,
};

/**
 * Enough of D1 for these routes, keeping every statement and every value it
 * was asked to bind — which is how the tests below check what the server
 * decided rather than what the request claimed.
 */
function stubDatabase(options: { rows?: readonly Row[]; first?: Row } = {}) {
  const asked: { sql: string; values: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const record = { sql, values: [] as unknown[] };
      asked.push(record);
      const statement = {
        bind(...values: unknown[]) {
          record.values = values;
          return statement;
        },
        all: async () => ({ results: [...(options.rows ?? [])] }),
        first: async () => options.first ?? null,
        run: async () => ({ success: true }),
      };
      return statement;
    },
  };
  return { asked, env: { DB: db } };
}

const call = async (
  path: string,
  init?: RequestInit,
  options?: { rows?: readonly Row[]; first?: Row },
) => {
  const { asked, env } = stubDatabase(options);
  const response = await api.request(path, init, env);
  return { response, asked };
};

const get = (path: string, options?: { rows?: readonly Row[]; first?: Row }) =>
  call(path, undefined, options);

const remove = (path: string, options?: { first?: Row }) =>
  call(path, { method: "DELETE" }, options);

const send = (
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  options?: { rows?: readonly Row[]; first?: Row },
) =>
  call(
    path,
    {
      method,
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    options,
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

/** The values an INSERT bound, by the column order the statement names. */
const boundColumns = (sql: string, values: readonly unknown[]) => {
  const names = sql
    .slice(sql.indexOf("(") + 1, sql.indexOf(")"))
    .split(",")
    .map((name) => name.trim());
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
};

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: string }).error;

describe("GET /api/levels", () => {
  it("answers with an empty list when nothing has been submitted", async () => {
    const { response } = await get("/api/levels");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });

  it("never asks the database for the melody, which is the answer", async () => {
    const { asked } = await get("/api/levels");

    assert.equal(asked.length, 1);
    assert.equal(asked[0]!.sql.includes("melody"), false);
    assert.equal(asked[0]!.sql.includes("*"), false);
  });

  it("hands back no melody even when the row it read holds one", async () => {
    const { response } = await get("/api/levels", {
      rows: [{ ...ROW, melody: JSON.stringify({ events: [{ pitch: "secret" }] }) }],
    });

    const body = await response.text();
    assert.equal(body.includes("secret"), false);
    assert.equal(body.includes("melody"), false);
  });

  it("gives a level the shape the page expects", async () => {
    const { response } = await get("/api/levels", { rows: [ROW] });

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
        createdAt: 1_754_500_000_000,
      },
    ]);
  });

  it("carries how much of a level is still unpitched", async () => {
    const { response } = await get("/api/levels", {
      rows: [{ ...ROW, unpitched_count: 7 }],
    });

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal(level!.unpitchedCount, 7);
  });

  it("leaves out a subtitle that was never given, rather than sending null", async () => {
    const { response } = await get("/api/levels", {
      rows: [{ ...ROW, subtitle: null }],
    });

    const [level] = (await response.json()) as Record<string, unknown>[];
    assert.equal("subtitle" in level!, false);
  });

  it("asks for no more than a page of them, newest first", async () => {
    const { asked } = await get("/api/levels");

    assert.match(asked[0]!.sql, /limit/i);
    assert.match(asked[0]!.sql, /order by created_at desc/i);
  });
});

describe("POST /api/levels", () => {
  it("takes a whole transcription and answers with its id", async () => {
    const { response, asked } = await send("/api/levels", "POST", submission());

    assert.equal(response.status, 201);
    const { id } = (await response.json()) as { id: string };
    assert.match(id, /^[0-9abcdefghjkmnpqrstvwxyz]{12}$/);
    assert.equal(asked.length, 1);
    assert.match(asked[0]!.sql, /insert into transcriptions/i);
  });

  it("counts the notes itself rather than believing the request", async () => {
    // Eight quarter notes is eight notes, whatever the body says about it.
    const { asked } = await send(
      "/api/levels",
      "POST",
      submission({ noteCount: 2, unpitchedCount: 99, measures: 1 }),
    );

    const bound = boundColumns(asked[0]!.sql, asked[0]!.values);
    assert.equal(bound.note_count, 8);
    assert.equal(bound.unpitched_count, 0);
    assert.equal(bound.measures, 2);
  });

  it("takes the meter and the key off the melody, not off the request", async () => {
    const { asked } = await send(
      "/api/levels",
      "POST",
      submission({ meter: { beats: 7, beatUnit: 8 }, keyFifths: 6 }),
    );

    const bound = boundColumns(asked[0]!.sql, asked[0]!.values);
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
      "/api/levels",
      "POST",
      submission({ melody: JSON.parse(JSON.stringify(encode(melody))) }),
    );

    const bound = boundColumns(asked[0]!.sql, asked[0]!.values);
    assert.equal(bound.note_count, 3);
    assert.equal(bound.unpitched_count, 2);
  });

  it("refuses a melody of fewer than two notes, and says why", async () => {
    const { response, asked } = await send(
      "/api/levels",
      "POST",
      submission({ melody: JSON.parse(JSON.stringify(encode(bars(1)))) }),
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /two notes/i);
    // Nothing was written; the CHECK constraint is a backstop, not the message.
    assert.deepEqual(asked, []);
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
        "/api/levels",
        "POST",
        submission({ details }),
      );
      assert.equal(response.status, 400, `took ${JSON.stringify(details)}`);
      assert.equal(typeof (await errorOf(response)), "string");
      assert.deepEqual(asked, []);
    }
  });

  it("refuses a melody that is not one", async () => {
    const wrong = JSON.parse(JSON.stringify(encode(bars(8))));
    wrong.key.letter = "H";

    const { response, asked } = await send(
      "/api/levels",
      "POST",
      submission({ melody: wrong }),
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /melody/i);
    assert.deepEqual(asked, []);
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
      "/api/levels",
      "POST",
      submission({ melody: JSON.parse(JSON.stringify(encode(melody))) }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(asked, []);
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
        "/api/levels",
        "POST",
        submission(over),
      );
      assert.equal(response.status, 400, `took ${JSON.stringify(over)}`);
      assert.deepEqual(asked, []);
    }
  });

  it("refuses a body that is not JSON at all", async () => {
    const { response, asked } = await send("/api/levels", "POST", "not json");

    assert.equal(response.status, 400);
    assert.deepEqual(asked, []);
  });

  it("refuses a body too large to be a transcription", async () => {
    const huge = { ...submission(), instructions: "a".repeat(200_000) };

    const { response, asked } = await send("/api/levels", "POST", huge);

    assert.equal(response.status, 413);
    assert.deepEqual(asked, []);
  });

  it("keeps the video, the marks and the clef the request gave", async () => {
    // These four are the only things it may not work out for itself.
    const { asked } = await send("/api/levels", "POST", submission());

    const bound = boundColumns(asked[0]!.sql, asked[0]!.values);
    assert.equal(bound.video_id, "dQw4w9WgXcQ");
    assert.equal(bound.mark_start, 12.5);
    assert.equal(bound.mark_end, 16.5);
    assert.equal(bound.clef, "treble");
  });
});

describe("GET /api/levels/:id/source", () => {
  it("hands over the melody, since this is the route that is meant to", async () => {
    const melody = JSON.parse(JSON.stringify(encode(bars(8))));
    const { response } = await get("/api/levels/k3m9x2p7qw4t/source", {
      first: { ...ROW, melody: JSON.stringify(melody) },
    });

    assert.equal(response.status, 200);
    const record = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(record.melody, melody);
    assert.equal(record.instructions, "The opening phrase.");
  });

  it("turns away an id that could not be one, without asking the database", async () => {
    // Ids arrive in URLs. Every query binds its values, so a strange one is
    // harmless — but there is nothing to look up, so nothing is looked up.
    for (const id of ["nope", "AAAAAAAAAAAA", "..%2F..%2Fetc"]) {
      const { response, asked } = await get(`/api/levels/${id}/source`);
      assert.equal(response.status, 404, `looked up ${id}`);
      assert.deepEqual(asked, []);
    }
  });

  it("says so plainly when there is no such level", async () => {
    const { response } = await get("/api/levels/k3m9x2p7qw4t/source");

    assert.equal(response.status, 404);
    assert.equal(typeof (await errorOf(response)), "string");
  });
});

describe("PUT /api/levels/:id", () => {
  // Eight quarter notes is two bars of 4/4, so the row has to say two — an
  // edit whose melody is a different length from the stored one is refused,
  // which would make every test below pass without reaching the UPDATE.
  const stored = {
    ...ROW,
    measures: 2,
    melody: JSON.stringify(encode(bars(8))),
  };
  const edit = { details: { title: "Clair de lune" }, melody: submission().melody };

  it("writes the melody and the details over the ones stored", async () => {
    const { response, asked } = await send(
      "/api/levels/k3m9x2p7qw4t",
      "PUT",
      edit,
      { first: stored },
    );

    assert.equal(response.status, 200);
    assert.match(asked.at(-1)!.sql, /update transcriptions/i);
  });

  it("cannot be made to change the clef or the video", async () => {
    // They are not in the body at all, which is what makes them immutable --
    // the editor merely agrees with this, rather than being what enforces it.
    const { response, asked } = await send(
      "/api/levels/k3m9x2p7qw4t",
      "PUT",
      { ...edit, clef: "bass", videoId: "aaaaaaaaaaa" },
      { first: stored },
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
      "/api/levels/k3m9x2p7qw4t",
      "PUT",
      { ...edit, markStart: 13.25, markEnd: 45 },
      { first: stored },
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
      "/api/levels/k3m9x2p7qw4t",
      "PUT",
      edit,
      { first: stored },
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
        "/api/levels/k3m9x2p7qw4t",
        "PUT",
        { ...edit, ...over },
        { first: stored },
      );
      assert.equal(response.status, 400, `took ${JSON.stringify(over)}`);
    }
  });

  it("refuses a melody of a different length from the one stored", async () => {
    // The bar count was chosen against the video's marks. A melody of another
    // length would leave those marks measuring something else.
    const { response } = await send(
      "/api/levels/k3m9x2p7qw4t",
      "PUT",
      { ...edit, melody: JSON.parse(JSON.stringify(encode(bars(12)))) },
      { first: stored },
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
      "/api/levels/k3m9x2p7qw4t",
      "PUT",
      { ...edit, melody: JSON.parse(JSON.stringify(encode(melody))) },
      { first: stored },
    );

    assert.equal(response.status, 400);
  });

  it("says so when there is no such level, and writes nothing", async () => {
    const { response, asked } = await send(
      "/api/levels/k3m9x2p7qw4t",
      "PUT",
      edit,
    );

    assert.equal(response.status, 404);
    assert.equal(
      asked.some((statement) => /update/i.test(statement.sql)),
      false,
    );
  });

  it("holds an edit to the same rules as a submission", async () => {
    const { response } = await send(
      "/api/levels/k3m9x2p7qw4t",
      "PUT",
      { ...edit, details: { title: "" } },
      { first: stored },
    );

    assert.equal(response.status, 400);
  });
});

describe("DELETE /api/levels/:id", () => {
  it("removes the level and says nothing back", async () => {
    const { response, asked } = await remove("/api/levels/k3m9x2p7qw4t", {
      first: ROW,
    });

    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assert.match(asked.at(-1)!.sql, /DELETE FROM transcriptions/);
  });

  it("names the row to delete by binding it, never by splicing it", async () => {
    // The id arrives in a URL, so the one thing that must never happen is for
    // it to reach the statement as text.
    const { asked } = await remove("/api/levels/k3m9x2p7qw4t", { first: ROW });

    const statement = asked.at(-1)!;
    assert.equal(statement.sql.includes("k3m9x2p7qw4t"), false);
    assert.deepEqual(statement.values, ["k3m9x2p7qw4t"]);
  });

  it("turns away an id that could not be one, without asking the database", async () => {
    for (const id of ["nope", "AAAAAAAAAAAA", "..%2F..%2Fetc"]) {
      const { response, asked } = await remove(`/api/levels/${id}`);
      assert.equal(response.status, 404, `looked up ${id}`);
      assert.deepEqual(asked, []);
    }
  });

  it("says so plainly when there is no such level, and deletes nothing", async () => {
    // Answering 204 either way would be simpler and would say that a mistyped
    // address had done something.
    const { response, asked } = await remove("/api/levels/k3m9x2p7qw4t");

    assert.equal(response.status, 404);
    assert.equal(typeof (await errorOf(response)), "string");
    assert.equal(
      asked.some((statement) => /DELETE/.test(statement.sql)),
      false,
    );
  });
});

describe("the api's edges", () => {
  it("answers an unknown api path with JSON, never a page", async () => {
    const { response } = await get("/api/nonsense");

    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(typeof (await errorOf(response)), "string");
  });

  it("refuses to let a response be taken for a type it is not", async () => {
    const { response } = await get("/api/levels");

    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  });
});

describe("the tempo the marks imply", () => {
  const stored = {
    ...ROW,
    measures: 2,
    melody: JSON.stringify(encode(bars(8))),
  };

  it("is refused when it is faster than music goes", async () => {
    // Two bars of 4/4 is eight beats; over a fifth of a second that is well
    // past 600, and a metronome asked for it would click ten times a second.
    const { response, asked } = await send(
      "/api/levels",
      "POST",
      submission({ markStart: 0, markEnd: 0.2 }),
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /BPM/);
    assert.deepEqual(asked, []);
  });

  it("is refused when it is slower than music goes", async () => {
    const { response } = await send(
      "/api/levels",
      "POST",
      submission({ markStart: 0, markEnd: 600 }),
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /BPM/);
  });

  it("is held to the same bounds when an edit moves the marks", async () => {
    const { response } = await send(
      "/api/levels/k3m9x2p7qw4t",
      "PUT",
      {
        details: { title: "Clair de lune" },
        melody: submission().melody,
        markStart: 0,
        markEnd: 0.2,
      },
      { first: stored },
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
      "/api/levels",
      "POST",
      submission({
        melody: JSON.parse(JSON.stringify(encode(melody))),
        markStart: 0,
        // Four felt beats across two seconds is 120; twelve would be 360.
        markEnd: 2,
      }),
    );

    assert.equal(response.status, 201);
  });
});
