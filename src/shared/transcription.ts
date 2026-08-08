/**
 * A transcription as it travels between the page and the database.
 *
 * Both sides import this, so nothing here may touch the DOM or the Workers
 * runtime: it is arithmetic over the music types and a handful of rules about
 * text. What it does not hold is as deliberate as what it does — the summary
 * type below has no room for a melody, so a route that only has a summary
 * cannot hand out the pitches even by accident.
 */

import type { MelodyJson } from "../editor/codec.js";
import type { Melody } from "../music/melody.js";
import { Rest, UnpitchedNote } from "../music/note-event.js";
import type { Mode, TimeSignature } from "../music/types.js";

/** The two clefs the setup page offers, and the two the database allows. */
export type Clef = "treble" | "bass";

/** What an author writes about their transcription. */
export type TranscriptionDetails = {
  title: string;
  subtitle?: string;
  description?: string;
};

/** The same, settled: trimmed, normalized, and empty fields dropped. */
export type CleanDetails = {
  title: string;
  subtitle: string | undefined;
  description: string | undefined;
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
  createdAt: number;
};

/** A whole row. Only a route that needs the answer should ever hold one. */
export type TranscriptionRecord = TranscriptionSummary & {
  description: string | undefined;
  melody: MelodyJson;
};

// ---- limits -------------------------------------------------------------
//
// These mirror the CHECK constraints in migrations/0001, and must keep
// mirroring them: a value that passes here and fails there reaches the author
// as a raw SQLite error instead of a sentence.

export const LIMITS = {
  title: { min: 1, max: 100 },
  subtitle: { max: 150 },
  description: { max: 2000 },
  /** Note groupings. The puzzle gives the first away, so two is the least. */
  noteCount: { min: 2 },
  /** A sixteen-bar melody encodes to about four thousand bytes. */
  melodyBytes: 64 * 1024,
} as const;

// ---- ids ----------------------------------------------------------------

/**
 * Crockford's base 32.
 *
 * `i`, `l` and `o` are gone because a reader sees `1`, `1` and `0`; `u` is
 * gone so that no id accidentally spells an obscenity. What is left is exactly
 * 32 characters, which is the point: 256 divides by it, so `% length` below
 * draws every character as often as every other.
 */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export const ID_LENGTH = 12;

/** Built from the alphabet so the two cannot drift; it holds no metacharacters. */
const ID_PATTERN = new RegExp(`^[${ALPHABET}]{${ID_LENGTH}}$`);

/**
 * A fresh id: 60 bits, which stays collision-free well past any level count
 * this will see. Random rather than counted, so the levels cannot be walked
 * from 1 upwards by anyone curious about what is in the database.
 */
export function newTranscriptionId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length]!;
  }
  return id;
}

/**
 * Whether this is an id at all.
 *
 * Ids arrive in URLs, so nothing is assumed about them. The database is safe
 * from a strange one regardless — every query binds its values rather than
 * spelling them into SQL — but a request that cannot name a level should be
 * turned away before it asks.
 */
export function isTranscriptionId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

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
    description: orNothing(raw.description),
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
  if (raw.description !== undefined && typeof raw.description !== "string") {
    return "The description must be text.";
  }

  const { title, subtitle, description } = cleanDetails(raw);

  if (showsNothing(title)) {
    return "A title is needed.";
  }
  const titleProblem = oneLineProblem(title, "title", LIMITS.title.max);
  if (titleProblem) return titleProblem;

  if (subtitle !== undefined) {
    const problem = oneLineProblem(subtitle, "subtitle", LIMITS.subtitle.max);
    if (problem) return problem;
  }

  if (description !== undefined) {
    if (CONTROL_BEYOND_NEWLINE.test(description)) {
      return "The description cannot hold control characters.";
    }
    if (BIDI.test(description)) {
      return "The description cannot reorder how it is shown.";
    }
    if (characters(description) > LIMITS.description.max) {
      return `The description is longer than ${LIMITS.description.max} characters.`;
    }
  }

  return undefined;
}
