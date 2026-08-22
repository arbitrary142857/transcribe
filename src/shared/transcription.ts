/**
 * A transcription as it travels between the page and the database.
 *
 * Both sides import this, so nothing here may touch the DOM or the Workers
 * runtime: it is arithmetic over the music types and a handful of rules about
 * text. What it does not hold is as deliberate as what it does — the summary
 * type below has no room for a melody, so a route that only has a summary
 * cannot hand out the pitches even by accident.
 */

import { decode, encode, type MelodyJson } from "../editor/codec.js";
import type { Melody } from "../music/melody.js";
import { Note, Rest, UnpitchedNote } from "../music/note-event.js";
import type { Mode, TimeSignature } from "../music/types.js";
import { isStars } from "./difficulty.js";
import { isId, newId } from "./id.js";

/** The two clefs the setup page offers, and the two the database allows. */
export type Clef = "treble" | "bass";

/**
 * Whether a level is the author's alone or everybody's.
 *
 * A draft is saved work: only its owner (and an admin) can open, play, or
 * change it, and the public listing never names it. Publishing freezes the
 * music and puts it in the listing. Unpublishing takes it back to a draft
 * under a *new* id, so whatever anybody remembered about the old one — a
 * bookmark, progress in a browser — points at nothing rather than at music
 * that may since have changed.
 *
 * Not to be confused with "unfinished", which is about `unpitchedCount` and
 * is a different axis: a draft may be finished, and the database refuses to
 * let an unfinished one be published.
 */
export type LevelStatus = "draft" | "published";

/** What an author writes about their transcription. */
export type TranscriptionDetails = {
  title: string;
  subtitle?: string;
  instructions?: string;
  /** How hard the author says it is: half a star to five, in halves, or unsaid. */
  difficulty?: number;
};

/** The same, settled: trimmed, normalized, and empty fields dropped. */
export type CleanDetails = {
  title: string;
  subtitle: string | undefined;
  instructions: string | undefined;
  difficulty: number | undefined;
};

/**
 * Everything a level card shows.
 *
 * There is deliberately nowhere in here to put a melody. Once these are
 * puzzles the pitches are the answer, and the listing query names its columns
 * rather than asking for the row — so the answer is not merely omitted from
 * the response, it is never read out of the database at all.
 */
export type TranscriptionSummary = {
  id: string;
  title: string;
  subtitle: string | undefined;
  videoId: string;
  /** Video seconds: where the first bar starts and the last bar ends. */
  markStart: number;
  markEnd: number;
  measures: number;
  clef: Clef;
  meter: TimeSignature;
  keyFifths: number;
  keyMode: Mode;
  /** Note groupings, so a tied run counts once. See `countSoundingNotes`. */
  noteCount: number;
  /**
   * How many of those are still waiting for a pitch. Zero means finished, and
   * finished is what a puzzle has to be. A card reads this to call itself
   * unfinished without anything having to open the melody.
   */
  unpitchedCount: number;
  /**
   * What the author wants known before it is played.
   *
   * Here rather than only on the whole record because the level list shows it:
   * pressing a card opens a box with these in it, and a second request just to
   * read a sentence the listing already had would be a strange thing to make
   * anybody wait for. It is prose somebody wrote, not the answer, so nothing
   * about the secrecy rule minds it travelling.
   */
  instructions: string | undefined;
  /**
   * Whose it is. An opaque id; a page compares it with the id /api/me gave
   * to decide whether to draw the pencil and the trash, which is drawing and
   * never permission.
   */
  ownerId: string;
  /**
   * The author's name as they would have it shown: their username, unless
   * they have asked to be Anonymous, in which case nothing. Optional rather
   * than `string | undefined` like the fields above it, so that every
   * summary written before it existed still type-checks; `authorDifficulty`
   * likewise.
   */
  author?: string;
  /** The author's word on how hard it is, in stars; nothing if unsaid. */
  authorDifficulty?: number;
  status: LevelStatus;
  /** The moment it went public, or nothing while it is a draft. */
  publishedAt: number | undefined;
  /** Moved by every write, including publishing; what "my transcriptions" sorts by. */
  updatedAt: number;
  createdAt: number;
};

/** A whole row. Only a route that needs the answer should ever hold one. */
export type TranscriptionRecord = TranscriptionSummary & {
  melody: MelodyJson;
};

// ---- limits -------------------------------------------------------------
//
// These mirror the CHECK constraints in migrations/0003 (which restated
// 0001's when the table was rebuilt), and must keep mirroring them: a value
// that passes here and fails there reaches the author as a raw SQLite error
// instead of a sentence.

export const LIMITS = {
  /** One cap for both, because a subtitle is only a second line of naming. */
  title: { min: 1, max: 128 },
  subtitle: { max: 128 },
  /**
   * What the author wants known before the level is played.
   *
   * 600 because the instructions people write — "ignore the grace notes",
   * "listen to the bass for a clue" — run a line or two apiece, so this holds
   * about eight of them and fills the level's modal at a readable measure
   * without becoming something to scroll.
   */
  instructions: { max: 600 },
  /** Note groupings. The puzzle gives the first away, so two is the least. */
  noteCount: { min: 2 },
  /** A sixteen-bar melody encodes to about four thousand bytes. */
  melodyBytes: 64 * 1024,
} as const;

// ---- ids ----------------------------------------------------------------
//
// The machinery lives in id.ts now, shared with users; re-exported here under
// the old names so nothing that asks after a transcription id has to know
// where ids come from.

export { ID_LENGTH } from "./id.js";
export const newTranscriptionId = newId;
export const isTranscriptionId = isId;

// ---- counting notes -----------------------------------------------------

/**
 * How many notes there are to find.
 *
 * Note groupings, not noteheads: a tied run is one sound however many heads it
 * is written with, so ten heads whose first nine are tied count two. Rests
 * count for nothing. A note still awaiting its pitch counts, because it is
 * exactly a note someone has yet to find.
 *
 * This is the same reckoning the puzzle uses when it gives the first note
 * away, and the two have to agree — the count says how much work a level is,
 * and one of those is already done.
 */
export function countSoundingNotes(melody: Melody): number {
  let count = 0;
  for (let index = 0; index < melody.eventCount; index++) {
    if (melody.getEvent(index) instanceof Rest) continue;
    // Every head after the first in a tied run belongs to a sound already counted.
    if (melody.isTiedToPrev(index)) continue;
    count++;
  }
  return count;
}

/**
 * How many of those notes are still waiting for a pitch.
 *
 * Counted the same way as `countSoundingNotes`, which is what makes the two
 * comparable: a tied run is one note whether or not it has been pitched yet,
 * because `setPitch` and `clearPitch` both work on the whole run and a tie is
 * refused between a pitched note and an unpitched one. So a run of four
 * unpitched heads is one note left to find, not four.
 *
 * Zero means the transcription is finished. That is the question a puzzle has
 * to be able to ask of a level, and asking it of the melody would mean reading
 * the answer.
 */
export function countUnpitchedNotes(melody: Melody): number {
  let count = 0;
  for (let index = 0; index < melody.eventCount; index++) {
    if (!(melody.getEvent(index) instanceof UnpitchedNote)) continue;
    if (melody.isTiedToPrev(index)) continue;
    count++;
  }
  return count;
}

/**
 * The events making up the first sounding note, or nothing if there is none.
 *
 * The whole tied run rather than the head of it, and that is not tidiness:
 * `Melody.tie()` refuses to join a pitched note to an unpitched one, so a
 * puzzle that revealed only the first head of a tied run would be a melody
 * that `decode()` throws on.
 */
export function firstSoundingNote(melody: Melody): number[] | undefined {
  for (let index = 0; index < melody.eventCount; index++) {
    if (!(melody.getEvent(index) instanceof Rest)) {
      return melody.getTiedGroup(index);
    }
  }
  return undefined;
}

/**
 * Whether two melodies are the same music, note for note.
 *
 * Both go through the codec, whose output is canonical — ties in index order,
 * brackets sorted — so two melodies that merely list their ties differently
 * are still the same, and a sender cannot manufacture a difference by
 * reordering JSON. What does count as different is everything a score shows:
 * a pitch, a length, a tie, a bracket, and a spelling. The check route
 * forgives an enharmonic respelling because a player never chooses one; an
 * author editing a published score is choosing one, and the published score
 * is what players are reading.
 */
export function sameMusic(a: Melody, b: Melody): boolean {
  return JSON.stringify(encode(a)) === JSON.stringify(encode(b));
}

// ---- the puzzle ---------------------------------------------------------

/**
 * The same music with the answer taken out: every pitch gone but the first
 * sounding note's.
 *
 * A *copy*, never the melody handed in. `Melody` is mutable and the one this
 * receives is the answer as it came out of the database, so stripping it in
 * place would empty the copy of record. The round trip through the codec is
 * how the editor's own history clones a melody, and reusing it means the
 * clone and the save format cannot drift apart.
 *
 * What survives is what is public anyway: the key and the meter are their own
 * columns, and the rhythm — every duration, tie and bracket — is the puzzle
 * rather than the answer to it. What leaves is every pitch but one.
 *
 * The whole opening tied run is revealed rather than its head, and that is not
 * generosity: `Melody.tie()` refuses to join a pitched note to an unpitched
 * one, so a puzzle giving away half a run is a melody that `decode()` throws
 * on at the other end. `firstSoundingNote()` returns the group for this reason.
 */
export function puzzleMelodyOf(melody: Melody): Melody {
  const puzzle = decode(encode(melody));
  const given = new Set(firstSoundingNote(puzzle) ?? []);

  for (let index = 0; index < puzzle.eventCount; index++) {
    if (given.has(index)) continue;
    // A rest has no pitch to take, and clearPitch() throws rather than shrug.
    if (puzzle.getEvent(index) instanceof Rest) continue;
    puzzle.clearPitch(index);
  }
  return puzzle;
}

/**
 * Which sounding notes an attempt got right.
 *
 * Keyed by the head of each tied run, counted exactly as `countSoundingNotes`
 * counts — a run of four tied heads is one note to find and gets one verdict,
 * which the page then paints across all four. Rests are not graded, because
 * nobody was asked to find them.
 *
 * Compared by MIDI rather than by spelling. Nobody chooses a spelling: a pitch
 * is entered by pressing a piano key and `spellForMelodyEvent` decides how to
 * write it, so an answer written D-sharp has to accept the E-flat the key
 * signature would have produced for the same sound. The cost is that a solved
 * score may be notated a little differently from how it was authored, which is
 * a fair price for not failing someone who heard it correctly.
 *
 * `total` counts the given note too, so it agrees with the `note_count` column
 * and with the "12 notes" a card advertises.
 *
 * A note nobody answered is marked wrong rather than passed over. The check
 * route will not accept a half-filled attempt, so this stands against a caller
 * that has not asked yet rather than against a player.
 */
export function gradeAttempt(
  melody: Melody,
  attempt: ReadonlyMap<number, number>,
): { verdicts: Map<number, boolean>; correct: number; total: number } {
  const verdicts = new Map<number, boolean>();
  let correct = 0;

  for (let index = 0; index < melody.eventCount; index++) {
    const event = melody.getEvent(index);
    if (event instanceof Rest) continue;
    // Every head after the first in a tied run is part of a sound already graded.
    if (melody.isTiedToPrev(index)) continue;

    // An unpitched answer belongs to a draft, which the route refuses. Nothing
    // matches it, so nothing is marked right by it.
    const right =
      event instanceof Note && attempt.get(index) === event.pitch.toMidi();
    verdicts.set(index, right);
    if (right) correct += 1;
  }

  return { verdicts, correct, total: verdicts.size };
}

// ---- text ---------------------------------------------------------------
//
// None of this is what keeps the site safe. SQL injection is impossible
// because every query binds its values instead of spelling them into the
// statement, and script injection is impossible because the pages build text
// nodes rather than assigning innerHTML. Both hold whatever characters arrive.
//
// These rules are about a card staying readable and a title meaning what it
// looks like. Every script and every emoji is ordinary text and passes.

/**
 * Characters that occupy no room, so a field of nothing but these is blank
 * however long it measures.
 *
 * Note what is *not* excluded elsewhere: U+200D, the zero-width joiner, lives
 * in this range and is load-bearing — it is what holds a family emoji together
 * and what Persian and Devanagari need to render. It is stripped for the
 * emptiness test and allowed everywhere else.
 */
const INVISIBLE = /[\s\u00AD\u180E\u200B-\u200F\u2060-\u2064\uFEFF]/gu;

/** C0 and C1. Nothing anyone writes contains one. */
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/u;

/** The same, sparing the newline that separates paragraphs. */
const CONTROL_BEYOND_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/u;

/**
 * Characters whose only purpose is to reorder what is shown, which is how a
 * title is made to read as something other than what it says.
 */
const BIDI = /[\u202A-\u202E\u2066-\u2069]/u;

/** Line endings settled, accents settled, edges trimmed. */
const tidy = (text: string): string =>
  text.replace(/\r\n?/gu, "\n").normalize("NFC").trim();

const showsNothing = (text: string): boolean =>
  text.replace(INVISIBLE, "") === "";

const orNothing = (text: string | undefined): string | undefined => {
  if (text === undefined) return undefined;
  const tidied = tidy(text);
  return showsNothing(tidied) ? undefined : tidied;
};

/**
 * What actually goes into the database.
 *
 * Accents are settled into one spelling because the same word can be typed two
 * ways — `é` as itself, or as `e` and a combining accent — and the two should
 * not count as different lengths or different titles. A field left as spaces
 * is dropped rather than stored as emptiness.
 */
export function cleanDetails(raw: TranscriptionDetails): CleanDetails {
  return {
    title: tidy(raw.title),
    subtitle: orNothing(raw.subtitle),
    instructions: orNothing(raw.instructions),
    // Passed through as given: `detailsProblem` has already held it to a
    // rating, and there is nothing to settle about a number.
    difficulty: raw.difficulty,
  };
}

/**
 * Characters, as SQLite counts them — not UTF-16 units, as `.length` does.
 *
 * Exported because the panel's live counter has to agree with the rule that
 * greys its button: `"👨‍👩‍👧".length` is 8 and this is 5, so a counter using the
 * other one would say a title was full while the validator still had room.
 */
export const countCharacters = (text: string): number => [...text].length;

const characters = countCharacters;

function oneLineProblem(
  text: string,
  label: string,
  max: number,
): string | undefined {
  if (CONTROL.test(text)) return `The ${label} must be a single line of text.`;
  if (BIDI.test(text)) return `The ${label} cannot reorder how it is shown.`;
  if (characters(text) > max) {
    return `The ${label} is longer than ${max} characters.`;
  }
  return undefined;
}

/**
 * Why these details cannot be saved, or nothing if they can.
 *
 * A sentence rather than a flag, in the shape `timingProblem()` and
 * `tieProblem()` already use, because the submit panel has to say why its
 * button is greyed and the route has to say why it refused.
 */
export function detailsProblem(
  raw: TranscriptionDetails,
): string | undefined {
  // Whatever arrived as JSON reaches this, so nothing is assumed to be text.
  if (typeof raw.title !== "string") {
    return "A title is needed.";
  }
  if (raw.subtitle !== undefined && typeof raw.subtitle !== "string") {
    return "The subtitle must be text.";
  }
  if (raw.instructions !== undefined && typeof raw.instructions !== "string") {
    return "The instructions must be text.";
  }

  const { title, subtitle, instructions } = cleanDetails(raw);

  if (showsNothing(title)) {
    return "A title is needed.";
  }
  const titleProblem = oneLineProblem(title, "title", LIMITS.title.max);
  if (titleProblem) return titleProblem;

  if (subtitle !== undefined) {
    const problem = oneLineProblem(subtitle, "subtitle", LIMITS.subtitle.max);
    if (problem) return problem;
  }

  if (instructions !== undefined) {
    if (CONTROL_BEYOND_NEWLINE.test(instructions)) {
      return "The instructions cannot hold control characters.";
    }
    if (BIDI.test(instructions)) {
      return "The instructions cannot reorder how they are shown.";
    }
    if (characters(instructions) > LIMITS.instructions.max) {
      return `The instructions are longer than ${LIMITS.instructions.max} characters.`;
    }
  }

  if (raw.difficulty !== undefined && !isStars(raw.difficulty)) {
    return "The difficulty is half a star to five stars, in halves.";
  }

  return undefined;
}
