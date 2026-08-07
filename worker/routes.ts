/**
 * Everything under /api.
 *
 * Kept apart from the entry beside it, and free of any Workers type, so that a
 * test can hand it a stand-in database and read back the responses it gives.
 * The entry is where the real bindings are met.
 */

import { Hono } from "hono";
import type { Mode } from "../src/music/types.js";
import type { Clef, TranscriptionSummary } from "../src/shared/transcription.js";

// ---- what a database is, as far as this file is concerned ---------------
//
// These two types name no D1 class. They describe a *shape*, and anything of
// that shape will do: the real D1PreparedStatement has these methods, and so
// does the twenty-line stub in test/api-levels.test.ts. That is the whole
// reason these routes can be tested in plain Node with no Workers runtime.
//
// `bind` returning `Statement` is what lets the three calls chain, and is why
// the type refers to itself.
//
// The three methods, in the order they are used below:
//
//   prepare(sql)  hands SQLite the statement *text*, with `?` standing where
//                 values will go. Nothing has run yet; this is a plan.
//   bind(...)     attaches values to those `?` marks. They travel beside the
//                 statement rather than inside it and are never parsed as SQL,
//                 which is why injection is not something this file defends
//                 against -- there is no path by which a value becomes syntax.
//   all()         runs it and gathers every row. (`first()` would take one row
//                 and `run()` none, for writes.)

type Statement = {
  bind(...values: unknown[]): Statement;
  all(): Promise<{ results: Record<string, unknown>[] }>;
};

export type Database = {
  prepare(sql: string): Statement;
};

/**
 * What `c.env` holds.
 *
 * `DB` is the name given to the D1 binding in wrangler.jsonc; passing this to
 * `Hono<{ Bindings: ApiEnv }>` is what makes `c.env.DB` typed rather than any.
 * The real binding is fitted to this shape in index.ts, and tsc checks there
 * that the two agree -- so if the description above is wrong, the entry stops
 * compiling rather than this file quietly lying.
 */
export type ApiEnv = { DB: Database };

/**
 * How many levels one listing hands back.
 *
 * A read of a table that only ever grows wants a ceiling, and this is the
 * arbitrary part: it is simply more levels than anyone will scroll before
 * paging is worth building. When it stops being enough, that is the signal to
 * build paging rather than to raise it.
 */
const LEVELS_PAGE = 100;

/**
 * The columns a level card is drawn from -- and, as importantly, not `melody`.
 *
 * Once these are puzzles the melody is the answer, so the listing does not
 * merely leave it out of the response: it never reads it out of the database
 * at all. Named one by one rather than `*` for exactly that reason.
 *
 * This constant is spliced into the SQL text below, which is the shape a SQL
 * injection takes -- so, plainly: it is a constant declared here, nothing
 * reaches it from a request, and it is the only thing in this file ever
 * spliced into a statement. Every value goes through `bind`.
 */
const LEVEL_COLUMNS = `
  id, title, subtitle, video_id, mark_start, mark_end,
  measures, clef, meter_beats, meter_unit,
  key_fifths, key_mode, note_count, created_at
`;

/**
 * One row of the above.
 *
 * `clef` and `key_mode` are narrowed to the handful of words they can hold
 * rather than to `string`, because the migration says
 * `CHECK (clef IN ('treble', 'bass'))` and SQLite tests that on the way in.
 * The database is what makes this true, not this declaration.
 *
 * The rest is a claim rather than a guarantee: SQLite columns are typed only
 * by affinity, so what makes `measures` a number is that the one route which
 * ever writes one validates it first. That claim is asserted in exactly one
 * place -- the cast in the handler below -- and it is worth revisiting the day
 * anything other than this codebase writes to the table.
 */
type LevelRow = {
  id: string;
  title: string;
  subtitle: string | null;
  video_id: string;
  mark_start: number;
  mark_end: number;
  measures: number;
  clef: Clef;
  meter_beats: number;
  meter_unit: number;
  key_fifths: number;
  key_mode: Mode;
  note_count: number;
  created_at: number;
};

/**
 * A row as the page wants it.
 *
 * Every field is carried across by name, which is the second reason a melody
 * cannot reach the page: were the query above ever widened, there would still
 * be nowhere here to put the answer.
 *
 * A subtitle nobody wrote arrives from SQLite as null and leaves as nothing at
 * all, since JSON drops what is undefined -- so the page has one shape fewer
 * to know about.
 */
const toSummary = (row: LevelRow): TranscriptionSummary => ({
  id: row.id,
  title: row.title,
  subtitle: row.subtitle ?? undefined,
  videoId: row.video_id,
  markStart: row.mark_start,
  markEnd: row.mark_end,
  measures: row.measures,
  clef: row.clef,
  meter: { beats: row.meter_beats, beatUnit: row.meter_unit },
  keyFifths: row.key_fifths,
  keyMode: row.key_mode,
  noteCount: row.note_count,
  createdAt: row.created_at,
});

export const api = new Hono<{ Bindings: ApiEnv }>();

// Every answer from here is data. Saying so, and saying not to guess
// otherwise, costs one header and closes the gap where a browser decides for
// itself what it has been handed.
api.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
});

api.get("/api/levels", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${LEVEL_COLUMNS} FROM transcriptions ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(LEVELS_PAGE)
    .all();

  // The one place the shape of a row is asserted rather than proved. See LevelRow.
  return c.json((results as LevelRow[]).map(toSummary));
});

// A path under /api naming nothing is answered as data, never as a page:
// whatever asked for it wanted JSON, and should be told in JSON that there is
// none.
api.notFound((c) =>
  c.json({ error: "There is nothing at that address." }, 404),
);

api.onError((error, c) => {
  // What went wrong is for the logs. What the caller gets is only that it did:
  // a stack trace in a response is a description of the inside of the server.
  console.error(error);
  return c.json({ error: "Something went wrong." }, 500);
});
