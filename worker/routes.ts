/**
 * Everything under /api.
 *
 * Kept apart from the entry beside it, and free of any Workers type, so that a
 * test can hand it a stand-in database and read back the responses it gives.
 * The entry is where the real bindings are met.
 */

import { Hono } from "hono";
import {
  decode,
  encode,
  parseMelodyJson,
  type MelodyJson,
} from "../src/editor/codec.js";
import { measureCountOf } from "../src/editor/position.js";
import type { Melody } from "../src/music/melody.js";
import type { Mode, TimeSignature } from "../src/music/types.js";
import { beatsPerBarOf } from "../src/playback/tempo-map.js";
import { MEASURES_MAX, timingProblem } from "../src/playback/timing-fields.js";
import {
  cleanDetails,
  countSoundingNotes,
  countUnpitchedNotes,
  detailsProblem,
  gradeAttempt,
  isTranscriptionId,
  LIMITS,
  newTranscriptionId,
  puzzleMelodyOf,
  type Clef,
  type TranscriptionRecord,
  type TranscriptionSummary,
} from "../src/shared/transcription.js";

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
  first(): Promise<Record<string, unknown> | null>;
  run(): Promise<unknown>;
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
  id, title, subtitle, instructions, video_id, mark_start, mark_end,
  measures, clef, meter_beats, meter_unit,
  key_fifths, key_mode, note_count, unpitched_count, created_at
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
  instructions: string | null;
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
  unpitched_count: number;
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
  instructions: row.instructions ?? undefined,
  videoId: row.video_id,
  markStart: row.mark_start,
  markEnd: row.mark_end,
  measures: row.measures,
  clef: row.clef,
  meter: { beats: row.meter_beats, beatUnit: row.meter_unit },
  keyFifths: row.key_fifths,
  keyMode: row.key_mode,
  noteCount: row.note_count,
  unpitchedCount: row.unpitched_count,
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

// ---- writing ------------------------------------------------------------
//
// Everything below this line can be reached by anyone who can reach the site,
// with any body they care to send. Two rules hold it together.
//
// The first is that nothing is believed. A body is shape-checked before it is
// read, and `parseMelodyJson` rebuilds the melody from only the fields it
// recognised, so what reaches storage is what this file assembled rather than
// what the sender assembled.
//
// The second is that nothing derivable is accepted. The meter, the key, the
// bar count and both note counts are worked out here from the decoded melody
// and never taken from the request -- otherwise a card could advertise four
// notes over a melody of four hundred, and the listing that must never read a
// melody would have no way of noticing.
//
// What is left, and so what a request genuinely supplies, is the four things
// no melody can imply: the video, the two marks, and the clef.

/** Room for a melody at its limit plus the text that travels beside it. */
const MAX_BODY_BYTES = LIMITS.melodyBytes + 8 * 1024;

/** The 11 characters YouTube names a video by. */
const VIDEO_ID = /^[\w-]{11}$/;

const isFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The two moments the marks name, if they name two.
 *
 * Both routes read these the same way, because an edit may now move them: the
 * first guess at where bar one starts is made against a video nobody has
 * transcribed yet, so it is the thing most worth being able to correct.
 */
function readMarks(
  body: Record<string, unknown>,
  fallback?: { start: number; end: number },
): { start: number; end: number } | { problem: string } {
  const { markStart, markEnd } = body;
  if (markStart === undefined && markEnd === undefined && fallback) {
    return fallback;
  }
  if (!isFinite(markStart) || markStart < 0) {
    return { problem: "The start mark is not a moment of the video." };
  }
  if (!isFinite(markEnd) || markEnd <= markStart) {
    return { problem: "The end mark has to come after the start mark." };
  }
  return { start: markStart, end: markEnd };
}

/**
 * Whether the marks and the music between them describe a tempo worth having.
 *
 * The same gate the setup page holds its Start button to, and for the same
 * reason: below ten a mistake reads as a tempo, and above six hundred the
 * metronome is being asked for ten clicks a second and the playhead crosses
 * the stave faster than an eye follows.
 */
const tempoProblem = (
  marks: { start: number; end: number },
  measures: number,
  meter: TimeSignature,
): string | undefined =>
  timingProblem(
    { start: marks.start, end: marks.end, measures, locked: false },
    beatsPerBarOf(meter),
  );

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Everything a melody settles about itself.
 *
 * Read off the decoded melody rather than off the request, which is what makes
 * a level card's numbers true. `measureCountOf` is the same reckoning the
 * editor uses, so a bar count cannot disagree with the music it counts.
 */
type Derived = {
  meterBeats: number;
  meterUnit: number;
  keyFifths: number;
  keyMode: Mode;
  measures: number;
  noteCount: number;
  unpitchedCount: number;
};

function derive(melody: Melody): Derived | { problem: string } {
  const noteCount = countSoundingNotes(melody);
  if (noteCount < LIMITS.noteCount.min) {
    return {
      problem: `A transcription needs at least two notes before it is worth saving.`,
    };
  }

  const measures = measureCountOf(melody);
  if (measures < 1 || measures > MEASURES_MAX) {
    return { problem: `A transcription runs from 1 to ${MEASURES_MAX} bars.` };
  }

  // fifths() is unbounded -- it counts seven per accidental, so B-sharp major
  // lands on twelve. The stave cannot print those and the column will not hold
  // them, so they are turned away here with a sentence rather than there with
  // a constraint violation.
  const keyFifths = melody.keySignature.fifths();
  if (!Number.isInteger(keyFifths) || keyFifths < -7 || keyFifths > 7) {
    return { problem: "That key signature is not one a stave can print." };
  }

  return {
    meterBeats: melody.timeSignature.beats,
    meterUnit: melody.timeSignature.beatUnit,
    keyFifths,
    keyMode: melody.keySignature.mode,
    measures,
    noteCount,
    unpitchedCount: countUnpitchedNotes(melody),
  };
}

/**
 * A body, if it is one: within size, JSON, an object, with sound details and a
 * melody that both parses and decodes.
 *
 * `decode` is inside the try because a shape-check cannot cover everything a
 * `Melody` insists on -- a tie needs matching pitches, a bracket needs a
 * writable length -- and those arrive as throws.
 */
async function readSubmission(
  request: Request,
): Promise<
  | {
      melody: Melody;
      json: MelodyJson;
      details: ReturnType<typeof cleanDetails>;
      /** The whole body, since a request can only be read once. */
      body: Record<string, unknown>;
    }
  | { status: 400 | 413; problem: string }
> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { status: 413, problem: "That transcription is too large to store." };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: 400, problem: "The request was not JSON." };
  }
  if (!isObject(body)) {
    return { status: 400, problem: "The request was not a transcription." };
  }

  const problem = detailsProblem(
    (isObject(body.details) ? body.details : {}) as never,
  );
  if (problem !== undefined) {
    return { status: 400, problem };
  }

  const json = parseMelodyJson(body.melody);
  if (json === undefined) {
    return { status: 400, problem: "That melody is not a melody." };
  }

  try {
    return {
      melody: decode(json),
      json,
      details: cleanDetails(body.details as never),
      body,
    };
  } catch {
    return { status: 400, problem: "That melody is not a melody." };
  }
}

api.post("/api/levels", async (c) => {
  const read = await readSubmission(c.req.raw);
  if ("status" in read) {
    return c.json({ error: read.problem }, read.status);
  }

  // The four things a melody cannot imply, and so the only four taken on trust
  // -- checked, but not derivable from anything else here.
  const { videoId, clef } = read.body;
  if (typeof videoId !== "string" || !VIDEO_ID.test(videoId)) {
    return c.json({ error: "That is not a YouTube video id." }, 400);
  }
  const marks = readMarks(read.body);
  if ("problem" in marks) {
    return c.json({ error: marks.problem }, 400);
  }
  if (clef !== "treble" && clef !== "bass") {
    return c.json({ error: "That is not a clef." }, 400);
  }

  const derived = derive(read.melody);
  if ("problem" in derived) {
    return c.json({ error: derived.problem }, 400);
  }

  const tempo = tempoProblem(marks, derived.measures, read.melody.timeSignature);
  if (tempo !== undefined) {
    return c.json({ error: tempo }, 400);
  }

  const id = newTranscriptionId();
  await c.env.DB.prepare(
    `INSERT INTO transcriptions (
      id, title, subtitle, instructions, video_id, mark_start, mark_end,
      measures, clef, meter_beats, meter_unit, key_fifths, key_mode,
      note_count, unpitched_count, melody, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      read.details.title,
      read.details.subtitle ?? null,
      read.details.instructions ?? null,
      videoId,
      marks.start,
      marks.end,
      derived.measures,
      clef satisfies Clef,
      derived.meterBeats,
      derived.meterUnit,
      derived.keyFifths,
      derived.keyMode,
      derived.noteCount,
      derived.unpitchedCount,
      JSON.stringify(read.json),
      Date.now(),
    )
    .run();

  return c.json({ id }, 201);
});

/**
 * The whole record, melody and all.
 *
 * Its own path because of what it hands over. Every other route is careful
 * never to read the melody column; this one exists to read it, which is what
 * the editor needs to reopen a transcription and what a puzzle must never be
 * given. Keeping it separate is what lets it be shut behind ownership later
 * without touching anything else.
 */
api.get("/api/levels/:id/source", async (c) => {
  const id = c.req.param("id");
  if (!isTranscriptionId(id)) {
    return c.json({ error: "There is no level at that address." }, 404);
  }

  const row = (await c.env.DB.prepare(
    `SELECT ${LEVEL_COLUMNS}, melody FROM transcriptions WHERE id = ?`,
  )
    .bind(id)
    .first()) as (LevelRow & { melody: string }) | null;

  if (row === null) {
    return c.json({ error: "There is no level at that address." }, 404);
  }

  const record: TranscriptionRecord = {
    ...toSummary(row),
    melody: JSON.parse(row.melody) as MelodyJson,
  };
  return c.json(record);
});

/**
 * Replace the music, the words, and where the music sits in the video.
 *
 * The marks are here because the first guess at them is made on the setup page,
 * against a video nobody has transcribed yet, and being a few tenths out is the
 * ordinary case rather than the exceptional one.
 *
 * The clef and the video are not here, and that absence is what makes them
 * immutable: there is nowhere in this route to put them, so no request moves
 * them. The editor agrees with that rule; this is what enforces it.
 *
 * A melody of a different length or meter is refused rather than stored. The
 * bar count and the marks measure each other, and music of another length would
 * leave them measuring something else -- so of the three, only the marks move.
 */
api.put("/api/levels/:id", async (c) => {
  const id = c.req.param("id");
  if (!isTranscriptionId(id)) {
    return c.json({ error: "There is no level at that address." }, 404);
  }

  const read = await readSubmission(c.req.raw);
  if ("status" in read) {
    return c.json({ error: read.problem }, read.status);
  }

  const row = (await c.env.DB.prepare(
    `SELECT measures, meter_beats, meter_unit, mark_start, mark_end
       FROM transcriptions WHERE id = ?`,
  )
    .bind(id)
    .first()) as Pick<
    LevelRow,
    "measures" | "meter_beats" | "meter_unit" | "mark_start" | "mark_end"
  > | null;

  if (row === null) {
    return c.json({ error: "There is no level at that address." }, 404);
  }

  const derived = derive(read.melody);
  if ("problem" in derived) {
    return c.json({ error: derived.problem }, 400);
  }
  if (derived.measures !== row.measures) {
    return c.json(
      { error: "An edit cannot change how many bars a transcription is." },
      400,
    );
  }
  if (
    derived.meterBeats !== row.meter_beats ||
    derived.meterUnit !== row.meter_unit
  ) {
    return c.json({ error: "An edit cannot change the meter." }, 400);
  }

  // An edit that says nothing about the marks leaves them where they were,
  // so saving a retitled level does not have to restate its timing.
  const marks = readMarks(read.body, {
    start: row.mark_start,
    end: row.mark_end,
  });
  if ("problem" in marks) {
    return c.json({ error: marks.problem }, 400);
  }

  const tempo = tempoProblem(marks, derived.measures, read.melody.timeSignature);
  if (tempo !== undefined) {
    return c.json({ error: tempo }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE transcriptions
        SET title = ?, subtitle = ?, instructions = ?,
            mark_start = ?, mark_end = ?,
            key_fifths = ?, key_mode = ?,
            note_count = ?, unpitched_count = ?, melody = ?
      WHERE id = ?`,
  )
    .bind(
      read.details.title,
      read.details.subtitle ?? null,
      read.details.instructions ?? null,
      marks.start,
      marks.end,
      derived.keyFifths,
      derived.keyMode,
      derived.noteCount,
      derived.unpitchedCount,
      JSON.stringify(read.json),
      id,
    )
    .run();

  return c.json({ id });
});

/**
 * Throw a level away.
 *
 * A workbench tool rather than a feature: there is no ownership yet, so there is
 * nobody this could belong to and nothing it could check. It exists to make a
 * local database workable while the rest is being built, and it goes — or grows
 * an owner — before any of this is somewhere strangers can reach.
 *
 * The row is looked up before it is deleted, so a mistyped address is answered
 * with "there is no such level" rather than with the silence that means "done".
 * Being wrong about which level was removed is the one mistake here that cannot
 * be taken back.
 */
api.delete("/api/levels/:id", async (c) => {
  const id = c.req.param("id");
  if (!isTranscriptionId(id)) {
    return c.json({ error: "There is no level at that address." }, 404);
  }

  const row = await c.env.DB.prepare(
    `SELECT id FROM transcriptions WHERE id = ?`,
  )
    .bind(id)
    .first();

  if (row === null) {
    return c.json({ error: "There is no level at that address." }, 404);
  }

  await c.env.DB.prepare(`DELETE FROM transcriptions WHERE id = ?`)
    .bind(id)
    .run();

  // Nothing left to describe, so nothing is sent.
  return c.body(null, 204);
});

// ---- playing ------------------------------------------------------------
//
// The two routes a puzzle is played through, and the reason the rest of this
// file is so careful about which columns it names. Both of them hold the
// answer in memory; neither lets any part of it into a response.
//
// `/puzzle` is the door `/source` is not: same row, same melody column, and
// what comes back has had every pitch but one taken out of it. A page that
// wanted the answer would have to ask `/source`, which is what will be shut
// behind ownership once there is such a thing.

/** Said by both routes about a draft, so the two cannot word it differently. */
const UNFINISHED =
  "That transcription is not finished, so there is nothing to play yet.";

const NO_LEVEL = "There is no level at that address.";

/** Room for an attempt at a melody's worth of notes and nothing like more. */
const MAX_ATTEMPT_BYTES = 64 * 1024;

/** The MIDI numbers a piano key can send. */
const MIDI_LOWEST = 0;
const MIDI_HIGHEST = 127;

const isWhole = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

/**
 * The melody a row holds.
 *
 * Every row was written by `readSubmission` above, so what comes back out has
 * already been through `parseMelodyJson` once. It is put through again rather
 * than cast, because the alternative is that a row this codebase did not write
 * -- a hand-run UPDATE, a restored backup -- becomes a thrown `decode` in the
 * middle of a route. Unreadable is answered by the caller as a 500, which is
 * the honest reply: nothing the player did caused it and nothing they can do
 * fixes it.
 */
function readAnswer(stored: string): Melody | undefined {
  try {
    const json = parseMelodyJson(JSON.parse(stored));
    return json === undefined ? undefined : decode(json);
  } catch {
    return undefined;
  }
}

/**
 * A level's answer, ready to be stripped or graded.
 *
 * `columns` is spliced into SQL, so both callers pass a constant declared in
 * this file and nothing else ever reaches it -- the same rule `LEVEL_COLUMNS`
 * is held to. Every value still goes through `bind`.
 */
async function readAnswerRow<T extends Record<string, unknown>>(
  db: Database,
  id: string,
  columns: string,
): Promise<{ row: T; answer: Melody } | { status: 404 | 409; problem: string }> {
  const row = (await db
    .prepare(`SELECT ${columns} FROM transcriptions WHERE id = ?`)
    .bind(id)
    .first()) as (T & { unpitched_count: number; melody: string }) | null;

  if (row === null) {
    return { status: 404, problem: NO_LEVEL };
  }
  // An answer with blanks in it cannot mark anybody's attempt. Read off the
  // column rather than the melody, which is the reason the column exists.
  if (row.unpitched_count > 0) {
    return { status: 409, problem: UNFINISHED };
  }

  const answer = readAnswer(row.melody);
  if (answer === undefined) {
    throw new Error(`The melody stored for level ${id} could not be read.`);
  }
  return { row, answer };
}

/**
 * A level as something to play: everything a card shows, and the rhythm.
 *
 * The melody that comes back is `puzzleMelodyOf`'s, so it carries exactly one
 * pitch -- the first sounding note, revealed whole where it is a tied run.
 * Everything else arrives as a note awaiting a pitch, which is what the stave
 * already draws with an x notehead.
 */
api.get("/api/levels/:id/puzzle", async (c) => {
  const id = c.req.param("id");
  if (!isTranscriptionId(id)) {
    return c.json({ error: NO_LEVEL }, 404);
  }

  const read = await readAnswerRow<LevelRow>(
    c.env.DB,
    id,
    `${LEVEL_COLUMNS}, melody`,
  );
  if ("status" in read) {
    return c.json({ error: read.problem }, read.status);
  }

  const record: TranscriptionRecord = {
    ...toSummary(read.row),
    melody: encode(puzzleMelodyOf(read.answer)),
  };
  return c.json(record);
});

/**
 * Mark an attempt.
 *
 * What goes back is a verdict per note and two counts, and on no path anything
 * more -- the solved reply included, which is the one most tempting to fill in
 * with the melody now that the player has earned it. They have the pitches
 * already: they typed them.
 *
 * This is an oracle, and knowingly so. Roughly forty of these requests can pin
 * one note without anybody listening to anything. Nothing here prevents that;
 * what answers it is that the page counts checks and shows the count beside
 * the time, so a solve arrived at that way reads as one. When times start
 * being compared, this is the route to revisit.
 */
api.post("/api/levels/:id/check", async (c) => {
  const id = c.req.param("id");
  if (!isTranscriptionId(id)) {
    return c.json({ error: NO_LEVEL }, 404);
  }

  const text = await c.req.raw.text();
  if (text.length > MAX_ATTEMPT_BYTES) {
    return c.json({ error: "That attempt is too large to read." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return c.json({ error: "The request was not JSON." }, 400);
  }

  const read = await readAnswerRow<{ melody: string }>(
    c.env.DB,
    id,
    "unpitched_count, melody",
  );
  if ("status" in read) {
    return c.json({ error: read.problem }, read.status);
  }

  const attempt = readAttempt(body, read.answer.eventCount);
  if (attempt === undefined) {
    return c.json({ error: "That is not an attempt at this level." }, 400);
  }

  const graded = gradeAttempt(read.answer, attempt);

  // Every note, and only the notes. A pitch at an index the answer rests on is
  // as much a sign of a confused caller as a missing one, and neither is
  // something the page sends -- so both are turned away rather than marked.
  for (const index of graded.verdicts.keys()) {
    if (!attempt.has(index)) {
      return c.json(
        { error: "Every note needs a pitch before the attempt can be checked." },
        400,
      );
    }
  }
  if (attempt.size !== graded.total) {
    return c.json(
      { error: "That attempt names something that is not a note to find." },
      400,
    );
  }

  return c.json({
    verdicts: [...graded.verdicts].map(([index, correct]) => ({
      index,
      correct,
    })),
    correct: graded.correct,
    total: graded.total,
    solved: graded.correct === graded.total,
  });
});

/**
 * A pitch per note, if that is what arrived.
 *
 * Indices are the melody's own, so they are checked against its length: they
 * come off the wire and reach `Melody.getEvent`, which throws on a stranger.
 * Two entries for one index are refused rather than resolved, in the shape
 * `readTiesJson` already uses -- a list saying the same thing twice is not one
 * the page wrote, and picking a winner would be guessing at what was meant.
 */
function readAttempt(
  body: unknown,
  eventCount: number,
): Map<number, number> | undefined {
  if (!isObject(body) || !Array.isArray(body.pitches)) return undefined;

  const attempt = new Map<number, number>();
  for (const entry of body.pitches as unknown[]) {
    if (!isObject(entry)) return undefined;
    const { index, midi } = entry;
    if (!isWhole(index) || index < 0 || index >= eventCount) return undefined;
    if (!isWhole(midi) || midi < MIDI_LOWEST || midi > MIDI_HIGHEST) {
      return undefined;
    }
    if (attempt.has(index)) return undefined;
    attempt.set(index, midi);
  }
  return attempt;
}

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
