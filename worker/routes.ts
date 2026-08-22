/**
 * Everything under /api.
 *
 * Kept apart from the entry beside it, and free of any Workers type, so that a
 * test can hand it a stand-in database and read back the responses it gives.
 * The entry is where the real bindings are met.
 */

import { Hono, type Context } from "hono";
import { auth, sessionUserOf, type GoogleSignIn } from "./auth.js";
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
import { mergeProgress, regradeProgress } from "../src/puzzle/merge.js";
import { halfOfStars, starsOfHalf } from "../src/shared/difficulty.js";
import { readProgress, type PlayProgress } from "../src/puzzle/progress.js";
import type { UserSummary } from "../src/shared/session.js";
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
  sameMusic,
  type Clef,
  type LevelStatus,
  type TranscriptionRecord,
  type TranscriptionSummary,
} from "../src/shared/transcription.js";

// ---- what a database is, as far as this file is concerned ---------------
//
// These two types name no D1 class. They describe a *shape*, and anything of
// that shape will do: the real D1PreparedStatement has these methods, and so
// does the stand-in in test/helpers/stub-database.ts. That is the whole
// reason these routes can be tested in plain Node with no Workers runtime.
//
// `bind` returning `Statement` is what lets the three calls chain, and is why
// the type refers to itself.
//
// The methods, in the order they are used below:
//
//   prepare(sql)  hands SQLite the statement *text*, with `?` standing where
//                 values will go. Nothing has run yet; this is a plan.
//   bind(...)     attaches values to those `?` marks. They travel beside the
//                 statement rather than inside it and are never parsed as SQL,
//                 which is why injection is not something this file defends
//                 against -- there is no path by which a value becomes syntax.
//   all()         runs it and gathers every row. (`first()` would take one row
//                 and `run()` none, for writes.)
//   batch(...)    runs several prepared statements in one round trip and one
//                 transaction: all of them take effect, or none does. For the
//                 two places a write is only right beside another write.

type Statement = {
  bind(...values: unknown[]): Statement;
  all(): Promise<{ results: Record<string, unknown>[] }>;
  first(): Promise<Record<string, unknown> | null>;
  run(): Promise<unknown>;
};

export type Database = {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
};

/**
 * What `c.env` holds.
 *
 * `DB` is the name given to the D1 binding in wrangler.jsonc; passing this to
 * `Hono<{ Bindings: ApiEnv }>` is what makes `c.env.DB` typed rather than any.
 * The real binding is fitted to this shape in index.ts, and tsc checks there
 * that the two agree -- so if the description above is wrong, the entry stops
 * compiling rather than this file quietly lying.
 *
 * `google` is the way to Google's token endpoint plus the credentials for it,
 * assembled in index.ts out of the vars and the secret -- or absent, when the
 * environment has no credentials, which the auth routes answer with a
 * sentence rather than a broken redirect.
 */
export type ApiEnv = { DB: Database; google?: GoogleSignIn };

/**
 * How many levels one listing hands back.
 *
 * A read of a table with no natural end wants a ceiling, and this is the
 * arbitrary part: it is simply more levels than anyone will scroll before
 * paging is worth building. When it stops being enough, that is the signal to
 * build paging rather than to raise it. The same ceiling serves an author's
 * own list, for the same reason.
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
 *
 * The last column reads the users table: the author's name, as they would
 * have it shown, or nothing when they have asked to be Anonymous. A
 * correlated subselect rather than a JOIN, so that every statement this is
 * spliced into stays `FROM transcriptions` and `id` keeps meaning the
 * level's. A rename in users renames every byline, which is the point of
 * the name living there.
 */
const LEVEL_COLUMNS = `
  id, title, subtitle, instructions, video_id, mark_start, mark_end,
  measures, clef, meter_beats, meter_unit,
  key_fifths, key_mode, note_count, unpitched_count, difficulty_half,
  owner_id, status, published_at, updated_at, created_at,
  (SELECT CASE WHEN u.anonymous_author = 1 THEN NULL ELSE u.username END
     FROM users u WHERE u.id = transcriptions.owner_id) AS author
`;

/**
 * One row of the above.
 *
 * `clef`, `key_mode` and `status` are narrowed to the handful of words they
 * can hold rather than to `string`, because the migration (0003, restating
 * 0001) says `CHECK (clef IN ('treble', 'bass'))` and SQLite tests that on
 * the way in. The database is what makes this true, not this declaration.
 *
 * The rest is a claim rather than a guarantee: SQLite columns are typed only
 * by affinity, so what makes `measures` a number is that the two routes which
 * ever write one validate it first. That claim is asserted where rows are
 * cast in the handlers below, and it is worth revisiting the day anything
 * other than this codebase writes to the table.
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
  difficulty_half: number | null;
  owner_id: string;
  author: string | null;
  status: LevelStatus;
  published_at: number | null;
  updated_at: number;
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
  ownerId: row.owner_id,
  author: row.author ?? undefined,
  authorDifficulty:
    row.difficulty_half === null || row.difficulty_half === undefined
      ? undefined
      : starsOfHalf(row.difficulty_half),
  status: row.status,
  publishedAt: row.published_at ?? undefined,
  updatedAt: row.updated_at,
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

// ---- who is asking --------------------------------------------------------
//
// Sign-in, sign-out, the session cookie and /api/me live in auth.ts; mounted
// after the middleware above so their answers carry the same header as
// everything else's. Every route that writes, and the one that reads the
// answer, asks `sessionUserOf` who is calling before it does anything else.
// The two play routes ask only once a row turns out to be a draft, which is
// what keeps a published level's hot path to one statement.
api.route("/", auth);

const NO_LEVEL = "There is no level at that address.";

const SIGN_IN_TO_EDIT = "Sign in to work on a level.";

/** Said of a published level, whose existence is no secret. */
const NOT_AUTHOR = "Only the author can change this level.";

/** The two columns every gated route needs beside whatever else it asked for. */
type Owned = { owner_id: string; status: LevelStatus };

type Refusal = { status: 401 | 403 | 404; problem: string };

/**
 * Whether this user may act on this row. An admin may act on any; the flag
 * comes off the users row by way of the session, never off a request.
 */
const ownerOrAdmin = (user: UserSummary, row: { owner_id: string }): boolean =>
  user.isAdmin || row.owner_id === user.id;

/**
 * The row a gated route may act on, or the reason it may not.
 *
 * Four questions, in an order that is itself a rule. First, whether the id
 * could name a level at all -- a strange one asks the database nothing.
 * Second, who is asking: before the row, so that a signed-out request learns
 * nothing about any id (every well-formed one is 401), and before the body on
 * the write routes, so that an anonymous sender's bytes are never parsed.
 * Third, the row. Fourth, whether it is theirs -- and when it is not, the
 * answer depends on what it is. A published level's existence is public, so
 * the refusal may say so: 403. A draft's existence is the author's, so a
 * stranger is told what a missing level would be told: 404, in the same words.
 *
 * `columns` is spliced into SQL, so every caller passes a constant declared in
 * this file -- the same rule `LEVEL_COLUMNS` is held to. The owner and status
 * are added to whatever was asked for; a caller whose columns already name
 * them simply gets them twice, which SQLite does not mind.
 */
async function readOwnedRow<T extends Record<string, unknown>>(
  c: Context<{ Bindings: ApiEnv }>,
  id: string,
  columns: string,
  notAuthor: string = NOT_AUTHOR,
): Promise<{ user: UserSummary; row: T & Owned } | Refusal> {
  if (!isTranscriptionId(id)) {
    return { status: 404, problem: NO_LEVEL };
  }

  const user = await sessionUserOf(c);
  if (user === undefined) {
    return { status: 401, problem: SIGN_IN_TO_EDIT };
  }

  const row = (await c.env.DB.prepare(
    `SELECT ${columns}, owner_id, status FROM transcriptions WHERE id = ?`,
  )
    .bind(id)
    .first()) as (T & Owned) | null;
  if (row === null) {
    return { status: 404, problem: NO_LEVEL };
  }

  if (!ownerOrAdmin(user, row)) {
    return row.status === "published"
      ? { status: 403, problem: notAuthor }
      : { status: 404, problem: NO_LEVEL };
  }
  return { user, row };
}

// ---- listing ------------------------------------------------------------

// Everybody's: what is published, newest first, with nobody asked who they are.
api.get("/api/levels", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${LEVEL_COLUMNS} FROM transcriptions
      WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind("published" satisfies LevelStatus, LEVELS_PAGE)
    .all();

  // The one place the shape of a row is asserted rather than proved. See LevelRow.
  return c.json((results as LevelRow[]).map(toSummary));
});

// One author's: drafts and published alike, most recently touched first. An
// admin sees their own here like anybody; a list of everybody's drafts would
// be its own route, and there is no call for one yet.
api.get("/api/mine", async (c) => {
  const user = await sessionUserOf(c);
  if (user === undefined) {
    return c.json({ error: "Sign in to see your levels." }, 401);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT ${LEVEL_COLUMNS} FROM transcriptions
      WHERE owner_id = ? ORDER BY updated_at DESC LIMIT ?`,
  )
    .bind(user.id, LEVELS_PAGE)
    .all();

  return c.json((results as LevelRow[]).map(toSummary));
});

// ---- writing ------------------------------------------------------------
//
// Everything below this line can be reached by anyone signed in, with any
// body they care to send; what they may touch is decided by the row's
// owner_id and nothing in the request. Two further rules hold it together.
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
// melody would have no way of noticing. The owner is never taken from the
// request either: it is whoever the session says, and the status of a new
// level is always draft.
//
// What is left, and so what a request genuinely supplies, is the four things
// no melody can imply: the video, the two marks, and the clef.

/** Room for a melody at its limit plus the text that travels beside it. */
const MAX_BODY_BYTES = LIMITS.melodyBytes + 8 * 1024;

/** The 11 characters YouTube names a video by. */
const VIDEO_ID = /^[\w-]{11}$/;

const isFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** The author's stars as the column holds them: halves, or NULL for unsaid. */
const halfOrNull = (stars: number | undefined): number | null =>
  stars === undefined ? null : halfOfStars(stars);

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

type Refused = { status: 400 | 413; problem: string };

type Body = {
  details: ReturnType<typeof cleanDetails>;
  /** The whole body, since a request can only be read once. */
  body: Record<string, unknown>;
};

type Music = { melody: Melody; json: MelodyJson };

/**
 * A body, if it is one: within size, JSON, an object, with sound details.
 *
 * The words alone, because that is all a published level will take; the
 * music is read separately by `readMelody`, and `readSubmission` below puts
 * the two together for the routes that want both.
 */
async function readBody(request: Request): Promise<Body | Refused> {
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

  return { details: cleanDetails(body.details as never), body };
}

const NOT_A_MELODY = "That melody is not a melody.";

/**
 * The melody a body carries, if it both parses and decodes.
 *
 * `decode` is inside the try because a shape-check cannot cover everything a
 * `Melody` insists on -- a tie needs matching pitches, a bracket needs a
 * writable length -- and those arrive as throws.
 */
function readMelody(body: Record<string, unknown>): Music | Refused {
  const json = parseMelodyJson(body.melody);
  if (json === undefined) {
    return { status: 400, problem: NOT_A_MELODY };
  }
  try {
    return { melody: decode(json), json };
  } catch {
    return { status: 400, problem: NOT_A_MELODY };
  }
}

/** Both at once: what a new transcription, or an edit to a draft, has to send. */
async function readSubmission(
  request: Request,
): Promise<(Body & Music) | Refused> {
  const read = await readBody(request);
  if ("problem" in read) {
    return read;
  }
  const music = readMelody(read.body);
  if ("problem" in music) {
    return music;
  }
  return { ...read, ...music };
}

api.post("/api/levels", async (c) => {
  // Before the body: the answer is the same whatever it holds, and nothing an
  // anonymous sender wrote gets parsed.
  const user = await sessionUserOf(c);
  if (user === undefined) {
    return c.json({ error: "Sign in to save a transcription." }, 401);
  }

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

  // A draft, owned by the caller; published_at is left unnamed, which is NULL,
  // which is what the CHECK wants beside 'draft'.
  const id = newTranscriptionId();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO transcriptions (
      id, owner_id, title, subtitle, instructions, difficulty_half, video_id, mark_start, mark_end,
      measures, clef, meter_beats, meter_unit, key_fifths, key_mode,
      note_count, unpitched_count, melody, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      user.id,
      read.details.title,
      read.details.subtitle ?? null,
      read.details.instructions ?? null,
      halfOrNull(read.details.difficulty),
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
      "draft" satisfies LevelStatus,
      now,
      now,
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
 * given. It is the author's door and nobody else's -- which is why it was kept
 * separate in the first place, so that shutting it touched nothing else.
 */
api.get("/api/levels/:id/source", async (c) => {
  const read = await readOwnedRow<LevelRow & { melody: string }>(
    c,
    c.req.param("id"),
    `${LEVEL_COLUMNS}, melody`,
    "Only the author can open a level's source.",
  );
  if ("problem" in read) {
    return c.json({ error: read.problem }, read.status);
  }

  const record: TranscriptionRecord = {
    ...toSummary(read.row),
    melody: JSON.parse(read.row.melody) as MelodyJson,
  };
  return c.json(record);
});

/** Why a published level's music and marks stay where they are. */
const PUBLISHED_LOCKED =
  "Only the title, subtitle, instructions and difficulty of a published level can change; unpublish it to change the music or the marks.";

/**
 * Replace the music, the words, and where the music sits in the video -- or,
 * once a level is published, the words alone.
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
 *
 * A published level is frozen further: its music is what players are reading
 * and what their saved attempts are keyed against, note by note, so an edit
 * that would change it is refused and told to unpublish first. The marks are
 * frozen with it, because moving them changes what a player hears and so how
 * hard the puzzle is. Judged by *difference* rather than by mention -- the
 * editor always sends the melody, and a level merely retitled should save --
 * which is the rule the bar count and the meter were already held to. And a
 * body that sends no melody at all is taken to mean the music is unchanged,
 * which is how the details box edits a published level without ever having
 * opened the editor. A draft is held to sending its melody, as a submission is.
 */
api.put("/api/levels/:id", async (c) => {
  const owned = await readOwnedRow<
    Pick<
      LevelRow,
      "measures" | "meter_beats" | "meter_unit" | "mark_start" | "mark_end"
    > & { melody: string }
  >(
    c,
    c.req.param("id"),
    "measures, meter_beats, meter_unit, mark_start, mark_end, melody",
  );
  if ("problem" in owned) {
    return c.json({ error: owned.problem }, owned.status);
  }
  const { row } = owned;
  const id = c.req.param("id");

  const words = await readBody(c.req.raw);
  if ("problem" in words) {
    return c.json({ error: words.problem }, words.status);
  }

  if (row.status === "published") {
    const marks = readMarks(words.body, { start: row.mark_start, end: row.mark_end });
    if ("problem" in marks) {
      return c.json({ error: marks.problem }, 400);
    }
    if (marks.start !== row.mark_start || marks.end !== row.mark_end) {
      return c.json({ error: PUBLISHED_LOCKED }, 409);
    }
    if (words.body.melody !== undefined) {
      const sent = readMelody(words.body);
      if ("problem" in sent) {
        return c.json({ error: sent.problem }, sent.status);
      }
      const stored = readAnswer(row.melody);
      if (stored === undefined) {
        throw new Error(`The melody stored for level ${id} could not be read.`);
      }
      if (!sameMusic(sent.melody, stored)) {
        return c.json({ error: PUBLISHED_LOCKED }, 409);
      }
    }

    await c.env.DB.prepare(
      `UPDATE transcriptions
          SET title = ?, subtitle = ?, instructions = ?, difficulty_half = ?,
              updated_at = ?
        WHERE id = ?`,
    )
      .bind(
        words.details.title,
        words.details.subtitle ?? null,
        words.details.instructions ?? null,
        halfOrNull(words.details.difficulty),
        Date.now(),
        id,
      )
      .run();

    return c.json({ id });
  }

  const music = readMelody(words.body);
  if ("problem" in music) {
    return c.json({ error: music.problem }, music.status);
  }
  const read = { ...words, ...music };

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
        SET title = ?, subtitle = ?, instructions = ?, difficulty_half = ?,
            mark_start = ?, mark_end = ?,
            key_fifths = ?, key_mode = ?,
            note_count = ?, unpitched_count = ?, melody = ?,
            updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      read.details.title,
      read.details.subtitle ?? null,
      read.details.instructions ?? null,
      halfOrNull(read.details.difficulty),
      marks.start,
      marks.end,
      derived.keyFifths,
      derived.keyMode,
      derived.noteCount,
      derived.unpitchedCount,
      JSON.stringify(read.json),
      Date.now(),
      id,
    )
    .run();

  return c.json({ id });
});

/**
 * Throw a level away. The author's to do, draft or published, and an admin's.
 *
 * The row is looked up before it is deleted -- that is what `readOwnedRow` is
 * -- so a mistyped address is answered with "there is no such level" rather
 * than with the silence that means "done". Being wrong about which level was
 * removed is the one mistake here that cannot be taken back.
 */
api.delete("/api/levels/:id", async (c) => {
  const id = c.req.param("id");
  const owned = await readOwnedRow(c, id, "id");
  if ("problem" in owned) {
    return c.json({ error: owned.problem }, owned.status);
  }

  await c.env.DB.prepare(`DELETE FROM transcriptions WHERE id = ?`)
    .bind(id)
    .run();

  // Nothing left to describe, so nothing is sent.
  return c.body(null, 204);
});

// ---- publishing -----------------------------------------------------------

const ALREADY_PUBLISHED = "That level is already published.";
const NOT_PUBLISHED = "That level is not published.";
const PUBLISH_UNFINISHED =
  "Every note needs a pitch before the level can be published.";

/**
 * Make a draft everybody's.
 *
 * A finished draft only: the database would refuse the other kind, but a
 * sentence is owed before a constraint is. Both clocks are stamped from one
 * moment, so a newly published level sits at the top of its author's list.
 * The `AND status = ?` is a compare-and-set: two publishes racing each other
 * both read 'draft', and the second then changes nothing rather than
 * re-stamping what the first already did.
 */
api.post("/api/levels/:id/publish", async (c) => {
  const id = c.req.param("id");
  const owned = await readOwnedRow<{ unpitched_count: number }>(
    c,
    id,
    "unpitched_count",
  );
  if ("problem" in owned) {
    return c.json({ error: owned.problem }, owned.status);
  }
  if (owned.row.status !== "draft") {
    return c.json({ error: ALREADY_PUBLISHED }, 409);
  }
  if (owned.row.unpitched_count > 0) {
    return c.json({ error: PUBLISH_UNFINISHED }, 409);
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE transcriptions
        SET status = ?, published_at = ?, updated_at = ?
      WHERE id = ? AND status = ?`,
  )
    .bind(
      "published" satisfies LevelStatus,
      now,
      now,
      id,
      "draft" satisfies LevelStatus,
    )
    .run();

  return c.json({ id });
});

/**
 * Take a level back: a draft again, under a new id.
 *
 * The new id is the point. Players keep their progress against a level's id --
 * in a browser, or in the progress table -- and an author who unpublishes is
 * about to change the music that progress was keyed to, note by note. Rather
 * than let old progress meet new music, the old id simply stops naming
 * anything: the draft is reached by the id this answers with, and whoever
 * bookmarked the old one finds a level that is not there, which is the truth.
 *
 * The progress table references this id, and deliberately does not follow it
 * (no ON UPDATE CASCADE), for the reason above. So every player's progress on
 * the level is deleted first -- in the same batch as the move, so neither
 * happens without the other -- and the database would refuse the move
 * otherwise, which is the backstop for this route forgetting. A browser's
 * copy, for anybody signed out, is out of reach and meets nothing instead.
 *
 * `published_at = NULL` is statement text, not a bound null, which is the
 * shape the codebase prefers.
 */
api.post("/api/levels/:id/unpublish", async (c) => {
  const id = c.req.param("id");
  const owned = await readOwnedRow(c, id, "id");
  if ("problem" in owned) {
    return c.json({ error: owned.problem }, owned.status);
  }
  if (owned.row.status !== "published") {
    return c.json({ error: NOT_PUBLISHED }, 409);
  }

  const fresh = newTranscriptionId();
  await c.env.DB.batch([
    c.env.DB.prepare(PROGRESS_SQL.forget).bind(id),
    c.env.DB.prepare(
      `UPDATE transcriptions
          SET id = ?, status = ?, published_at = NULL, updated_at = ?
        WHERE id = ? AND status = ?`,
    ).bind(
      fresh,
      "draft" satisfies LevelStatus,
      Date.now(),
      id,
      "published" satisfies LevelStatus,
    ),
  ]);

  return c.json({ id: fresh });
});

// ---- playing ------------------------------------------------------------
//
// The two routes a puzzle is played through, and the reason the rest of this
// file is so careful about which columns it names. Both of them hold the
// answer in memory; neither lets any part of it into a response.
//
// `/puzzle` is the door `/source` is not: same row, same melody column, and
// what comes back has had every pitch but one taken out of it. A page that
// wanted the answer would have to ask `/source`, which is the author's alone.
//
// A published level is played by anybody, and asking who they are before the
// row is read would cost every check a sessions query for nothing. A draft is
// played only by its author, so the question is asked when -- and only when
// -- the row has said it is one. `/check` asks once more, last of all, for
// whoever carries a session cookie: their checks are counted against the
// account (see the progress section below), and a visitor without a cookie
// is never asked.

/**
 * Said by both routes about a level still missing pitches, so the two cannot
 * word it differently. The database no longer lets such a level be published,
 * so only an author previewing their own unfinished draft can hear this.
 */
const UNFINISHED =
  "That transcription is not finished, so there is nothing to play yet.";

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
 *
 * A draft answers 404 to everyone but its author and an admin -- never 401 or
 * 403, because a draft's existence is the author's to disclose, and a stranger
 * is told exactly what a missing level would tell them.
 *
 * Who was asking comes back with the row, when it was found out: a caller
 * that needs the answer too should not ask the sessions table twice. A caller
 * that already knows passes `viewer`, and the question is never asked at all.
 */
async function readAnswerRow<T extends Record<string, unknown>>(
  c: Context<{ Bindings: ApiEnv }>,
  id: string,
  columns: string,
  viewer?: UserSummary,
): Promise<
  | { row: T; answer: Melody; user: UserSummary | undefined }
  | { status: 404 | 409; problem: string }
> {
  const row = (await c.env.DB.prepare(
    `SELECT ${columns}, owner_id, status FROM transcriptions WHERE id = ?`,
  )
    .bind(id)
    .first()) as
    | (T & Owned & { unpitched_count: number; melody: string })
    | null;

  if (row === null) {
    return { status: 404, problem: NO_LEVEL };
  }
  let user = viewer;
  if (row.status === "draft") {
    user ??= await sessionUserOf(c);
    if (!canSee(user, row)) {
      return { status: 404, problem: NO_LEVEL };
    }
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
  return { row, answer, user };
}

/** Whether this viewer may see this row: anybody a published one, owner or admin a draft. */
const canSee = (user: UserSummary | undefined, row: Owned): boolean =>
  row.status === "published" || (user !== undefined && ownerOrAdmin(user, row));

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

  const read = await readAnswerRow<LevelRow>(c, id, `${LEVEL_COLUMNS}, melody`);
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
 * what answers it is that the checks are counted -- here, against the
 * account, for anybody signed in, and by the page for anybody else -- and
 * shown beside the time, so a solve arrived at that way reads as one. When
 * times start being compared, this is the route to revisit.
 *
 * The count is written last, after the attempt has been graded, and only for
 * somebody signed in: see the end of the route.
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
    c,
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

  const solved = graded.correct === graded.total;

  // Who is asking, asked last: after the attempt has been refused or graded,
  // so a malformed one costs no session query -- and not at all for a
  // published level when there is no cookie, since `sessionUserOf` asks
  // nothing then, which is what keeps anonymous play at one statement. A
  // draft already cost the question on the way in; its answer is reused.
  //
  // The row is the account's record of this level: one more check, the
  // pitches as they stand, and the solve if this was it. The verdicts go in
  // only when the row is begun here; afterwards they are the page's, which
  // saves the whole of them the moment this answer lands. A solved row is
  // finished -- the statement's WHERE makes this a no-op on one -- so a tab
  // that did not hear about the solve cannot turn "Flawless!" into two.
  const user = read.user ?? (await sessionUserOf(c));
  if (user !== undefined) {
    const now = Date.now();
    await c.env.DB.prepare(PROGRESS_SQL.check)
      .bind(
        user.id,
        id,
        solved ? now : null,
        JSON.stringify(
          [...attempt]
            .map(([index, midi]) => ({ index, midi }))
            .sort((a, b) => a.index - b.index),
        ),
        JSON.stringify(
          [...graded.verdicts].map(([index, correct]) => ({
            index,
            midi: attempt.get(index)!,
            correct,
          })),
        ),
        now,
      )
      .run();
  }

  return c.json({
    verdicts: [...graded.verdicts].map(([index, correct]) => ({
      index,
      correct,
    })),
    correct: graded.correct,
    total: graded.total,
    solved,
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

// ---- progress -----------------------------------------------------------
//
// Where each signed-in player got to on each level: one row per (account,
// level), the shape `PlayProgress` has always had. Two of its columns are the
// server's -- check_count and solved_at, written only by `/check` above,
// which is the one thing that knows a check happened -- and the rest are the
// page's, saved as it goes. Nothing about anybody signed out reaches this
// table: their record stays in their browser, and arrives here only through
// the merge route, when they sign in and say yes. docs/progress.md is the
// reference.
//
// Every route here asks who is calling first, and answers 401 before any row
// is looked up or any body read; there is no progress for nobody.

const SIGN_IN_TO_PLAY = "Sign in to keep your progress.";

/** Room for a record at a melody's limit, as an attempt has. */
const MAX_PROGRESS_BYTES = 64 * 1024;

/** Room for a browser's worth of records. */
const MAX_MERGE_BYTES = 1024 * 1024;

/** More levels than one browser will have been played on before it is asked. */
const MERGE_MAX = 100;

/**
 * How many rows one listing hands back: more levels than one player will have
 * touched before paging is worth building, in the `LEVELS_PAGE` spirit.
 */
const PROGRESS_PAGE = 1000;

/**
 * Every statement that reads or writes progress, in one place and exported.
 *
 * Exported for one reader: test/migrations.test.ts, which runs these against
 * the real schema in real SQLite. The stand-in database the route tests use
 * never parses a statement, so an upsert whose ON CONFLICT clause was wrong
 * would pass every one of them and fail on the first deploy. These are the
 * statements with the most syntax in them, so they are the ones proved.
 *
 * Three upserts, one per writer, and what each may touch is the whole of the
 * ownership rule. `check` counts and stamps; it moves the pitches, and writes
 * verdicts only when it begins the row. `save` is the page's: clock, pitches
 * and verdicts, and it names neither the count nor the solve (the `0, NULL`
 * in its VALUES is for a row begun by a save). `merge` writes a row whole,
 * which only the merge route may do, having settled the row itself.
 *
 * A solved row is finished. `check` writes nothing to one (the WHERE on its
 * DO UPDATE), so a tab that never heard about the solve cannot add to the
 * count or overwrite the pitches the page now treats as confirmed; and `save`
 * keeps a solved row's pitches for the same reason, while still taking the
 * clock and the verdicts, because the save that follows the solving check is
 * what carries the stopped clock and the final colouring.
 */
export const PROGRESS_SQL = {
  // bind: user_id, level_id, solved_at | null, pitches, judged, updated_at
  check: `INSERT INTO progress
            (user_id, level_id, elapsed_ms, check_count, solved_at, pitches, judged, updated_at)
          VALUES (?, ?, 0, 1, ?, ?, ?, ?)
          ON CONFLICT (user_id, level_id) DO UPDATE SET
            check_count = check_count + 1,
            solved_at   = excluded.solved_at,
            pitches     = excluded.pitches,
            updated_at  = excluded.updated_at
          WHERE solved_at IS NULL`,

  // bind: user_id, level_id, elapsed_ms, pitches, judged, updated_at
  save: `INSERT INTO progress
           (user_id, level_id, elapsed_ms, check_count, solved_at, pitches, judged, updated_at)
         VALUES (?, ?, ?, 0, NULL, ?, ?, ?)
         ON CONFLICT (user_id, level_id) DO UPDATE SET
           elapsed_ms = excluded.elapsed_ms,
           pitches    = CASE WHEN solved_at IS NULL THEN excluded.pitches ELSE pitches END,
           judged     = excluded.judged,
           updated_at = excluded.updated_at`,

  // bind: user_id, level_id, elapsed_ms, check_count, solved_at | null,
  //       pitches, judged, updated_at
  merge: `INSERT INTO progress
            (user_id, level_id, elapsed_ms, check_count, solved_at, pitches, judged, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, level_id) DO UPDATE SET
            elapsed_ms  = excluded.elapsed_ms,
            check_count = excluded.check_count,
            solved_at   = excluded.solved_at,
            pitches     = excluded.pitches,
            judged      = excluded.judged,
            updated_at  = excluded.updated_at`,

  // bind: user_id, level_id
  read: `SELECT level_id, elapsed_ms, check_count, solved_at, pitches, judged
           FROM progress WHERE user_id = ? AND level_id = ?`,

  // bind: user_id, limit
  readAll: `SELECT level_id, elapsed_ms, check_count, solved_at, pitches, judged
              FROM progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`,

  // bind: level_id
  forget: `DELETE FROM progress WHERE level_id = ?`,
} as const;

/** A row of the progress table, as `PROGRESS_SQL.read` reads one. */
type ProgressRow = {
  level_id: string;
  elapsed_ms: number;
  check_count: number;
  solved_at: number | null;
  pitches: string;
  judged: string;
};

/**
 * A row as the page wants it, held to `readProgress` like anything else.
 *
 * A row this code did not write -- a hand-run UPDATE, a restored backup -- is
 * a throw rather than a guess, answered as 500: nothing the player did caused
 * it and nothing they can do fixes it, which is the same answer an unreadable
 * melody gets.
 */
function progressOf(row: ProgressRow): PlayProgress {
  let progress: PlayProgress | undefined;
  try {
    progress = readProgress(
      {
        levelId: row.level_id,
        elapsedMs: row.elapsed_ms,
        checkCount: row.check_count,
        solvedAt: row.solved_at ?? undefined,
        pitches: JSON.parse(row.pitches),
        judged: JSON.parse(row.judged),
      },
      row.level_id,
    );
  } catch {
    progress = undefined;
  }
  if (progress === undefined) {
    throw new Error(`The progress stored for level ${row.level_id} could not be read.`);
  }
  return progress;
}

/**
 * The level a player's progress is filed under, if the viewer may see it.
 *
 * Owner and status alone, never the melody: nothing here grades anything. No
 * 409 for a draft still missing pitches either -- nothing can be checked
 * against one, so a row for it is harmless, and it goes with the level.
 */
async function readVisibleLevel(
  c: Context<{ Bindings: ApiEnv }>,
  user: UserSummary,
  id: string,
): Promise<Owned | undefined> {
  const row = (await c.env.DB.prepare(
    `SELECT owner_id, status FROM transcriptions WHERE id = ?`,
  )
    .bind(id)
    .first()) as Owned | null;
  return row !== null && canSee(user, row) ? row : undefined;
}

const toProgressRow = (progress: PlayProgress, now: number) => ({
  pitches: JSON.stringify(progress.pitches),
  judged: JSON.stringify(progress.judged),
  solvedAt: progress.solvedAt ?? null,
  now,
});

// Everything the account holds, most recently touched first: what the level
// list asks, once, for every card it draws.
api.get("/api/progress", async (c) => {
  const user = await sessionUserOf(c);
  if (user === undefined) {
    return c.json({ error: SIGN_IN_TO_PLAY }, 401);
  }

  const { results } = await c.env.DB.prepare(PROGRESS_SQL.readAll)
    .bind(user.id, PROGRESS_PAGE)
    .all();

  return c.json((results as ProgressRow[]).map(progressOf));
});

// One level's record, for the play page opening it. 204 is "nothing yet",
// which is not an error; 404 is the level, in the words `/puzzle` would use.
api.get("/api/progress/:levelId", async (c) => {
  const id = c.req.param("levelId");
  if (!isTranscriptionId(id)) {
    return c.json({ error: NO_LEVEL }, 404);
  }

  const user = await sessionUserOf(c);
  if (user === undefined) {
    return c.json({ error: SIGN_IN_TO_PLAY }, 401);
  }

  if ((await readVisibleLevel(c, user, id)) === undefined) {
    return c.json({ error: NO_LEVEL }, 404);
  }

  const row = (await c.env.DB.prepare(PROGRESS_SQL.read)
    .bind(user.id, id)
    .first()) as ProgressRow | null;
  if (row === null) {
    return c.body(null, 204);
  }
  return c.json(progressOf(row));
});

/**
 * The page's save: the clock, the pitches and the verdicts.
 *
 * What the body says about the check count or the solve is not read, let
 * alone written: those are `/check`'s. The body is held to `readProgress`
 * with those two filled in blank, which also refuses a record filed under
 * another level, however it got there.
 */
api.put("/api/progress/:levelId", async (c) => {
  const id = c.req.param("levelId");
  if (!isTranscriptionId(id)) {
    return c.json({ error: NO_LEVEL }, 404);
  }

  const user = await sessionUserOf(c);
  if (user === undefined) {
    return c.json({ error: SIGN_IN_TO_PLAY }, 401);
  }

  const text = await c.req.raw.text();
  if (text.length > MAX_PROGRESS_BYTES) {
    return c.json({ error: "That progress is too large to keep." }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return c.json({ error: "The request was not JSON." }, 400);
  }

  const progress = isObject(body)
    ? readProgress(
        {
          levelId: body.levelId ?? id,
          elapsedMs: body.elapsedMs,
          checkCount: 0,
          solvedAt: undefined,
          pitches: body.pitches,
          judged: body.judged,
        },
        id,
      )
    : undefined;
  if (progress === undefined) {
    return c.json({ error: "That is not progress at this level." }, 400);
  }

  if ((await readVisibleLevel(c, user, id)) === undefined) {
    return c.json({ error: NO_LEVEL }, 404);
  }

  const row = toProgressRow(progress, Date.now());
  await c.env.DB.prepare(PROGRESS_SQL.save)
    .bind(user.id, id, Math.floor(progress.elapsedMs), row.pitches, row.judged, row.now)
    .run();

  return c.body(null, 204);
});

/**
 * A browser's records, offered to the account.
 *
 * Every record is read before any level is looked up, so nothing is done
 * with a body until the whole of it is believed. Then, per record: the level
 * and its answer (a missing level, somebody else's draft and an unfinished
 * one are all passed over in the same silence, so the answer says nothing
 * about any draft's existence); the account's own row; and the merge rule in
 * src/puzzle/merge.ts, which regrades the browser's record against the answer
 * before it believes a word of it. The writes go as one batch at the end, so
 * `taken` is exactly what landed, and a failure leaves the browser its copies
 * for another try, which the rule makes harmless.
 *
 * A record that leaves the account's row as it was is taken all the same:
 * the browser may drop its copy either way.
 */
api.post("/api/progress/merge", async (c) => {
  const user = await sessionUserOf(c);
  if (user === undefined) {
    return c.json({ error: SIGN_IN_TO_PLAY }, 401);
  }

  const TOO_MUCH = "That is too much progress to merge at once.";
  const text = await c.req.raw.text();
  if (text.length > MAX_MERGE_BYTES) {
    return c.json({ error: TOO_MUCH }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return c.json({ error: "The request was not JSON." }, 400);
  }
  if (!isObject(body) || !Array.isArray(body.records)) {
    return c.json({ error: "That is not a list of progress." }, 400);
  }
  if (body.records.length > MERGE_MAX) {
    return c.json({ error: TOO_MUCH }, 413);
  }

  const offered: PlayProgress[] = [];
  for (const entry of body.records as unknown[]) {
    const record =
      isObject(entry) && isTranscriptionId(entry.levelId)
        ? readProgress(entry, entry.levelId)
        : undefined;
    // A list saying the same level twice is not one the page wrote.
    if (record === undefined || offered.some((each) => each.levelId === record.levelId)) {
      return c.json({ error: "That is not progress." }, 400);
    }
    offered.push(record);
  }

  const now = Date.now();
  const taken: string[] = [];
  const writes = [];
  for (const browser of offered) {
    const read = await readAnswerRow<{ melody: string }>(
      c,
      browser.levelId,
      "unpitched_count, melody",
      user,
    );
    if ("status" in read) continue;

    const held = (await c.env.DB.prepare(PROGRESS_SQL.read)
      .bind(user.id, browser.levelId)
      .first()) as ProgressRow | null;
    const account = held === null ? undefined : progressOf(held);

    const merged = mergeProgress(read.answer, account, browser);
    taken.push(browser.levelId);

    if (
      account !== undefined &&
      JSON.stringify(merged) ===
        JSON.stringify(regradeProgress(read.answer, account).progress)
    ) {
      continue;
    }

    const row = toProgressRow(merged, now);
    writes.push(
      c.env.DB.prepare(PROGRESS_SQL.merge).bind(
        user.id,
        browser.levelId,
        merged.elapsedMs,
        merged.checkCount,
        row.solvedAt,
        row.pitches,
        row.judged,
        row.now,
      ),
    );
  }

  if (writes.length > 0) {
    await c.env.DB.batch(writes);
  }

  return c.json({ taken });
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
