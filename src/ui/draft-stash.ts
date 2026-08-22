/**
 * Work in flight, kept on this machine for the minutes a sign-in takes.
 *
 * Signing in is a chain of page navigations, and the editor's state does not
 * survive one. So when somebody presses Save without being signed in, the
 * whole of what they were doing — the melody, the words, and everything the
 * setup page settled — is written here, the browser is sent to Google, and
 * the editor that loads on the way back reads it and carries on, without the
 * setup page, as if nothing had happened.
 *
 * A third kind of thing in local storage, beside progress (which belongs to
 * an account the day there is one) and the compact preference (which belongs
 * to this machine forever): this belongs to the next few minutes. It is read
 * once and cleared, and a stash nobody came back for within a day is ignored
 * rather than sprung on them weeks later as a surprise.
 *
 * Takes the storage as an argument, like `progress.ts`, so a test can hand it
 * a Map and no DOM.
 */

import { parseMelodyJson, type MelodyJson } from "../editor/codec.js";
import type { TimeSignature } from "../music/types.js";
import type { Marks } from "../playback/tempo-map.js";
import type { Storage } from "../puzzle/progress.js";
import { isStars } from "../shared/difficulty.js";
import {
  isTranscriptionId,
  type Clef,
  type TranscriptionDetails,
} from "../shared/transcription.js";

export const DRAFT_KEY = "transcribe:draft";

/** Longer than any sign-in, shorter than forgetting. */
const KEEP_FOR_MS = 24 * 60 * 60 * 1000;

/** The 11 characters YouTube names a video by, as the routes check them. */
const VIDEO_ID = /^[\w-]{11}$/u;

export type Draft = {
  melody: MelodyJson;
  details: TranscriptionDetails;
  /** What the setup page settled, so it need not be asked again. */
  setup: {
    clef: Clef;
    meter: TimeSignature;
    videoId: string;
    marks: Marks;
    measures: number;
  };
  /** The level this was work on, when it already had an address. */
  levelId?: string;
  /**
   * What signing in was for. "save": Save was pressed, so the work is saved
   * the moment somebody is signed in. "keep": the sign-in was from the nav,
   * so the work is only put back, and saving stays the visitor's to do.
   */
  intent: "save" | "keep";
  /** When it was stashed. Epoch milliseconds. */
  at: number;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWhole = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

const isFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const textOrNothing = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * A draft, if the value is one — rebuilt field by field, so nothing that was
 * in storage rides along into the editor.
 *
 * The details are checked for shape and not for sense: a title too long to
 * save is still work worth getting back, and the editor says why it cannot
 * be saved yet. The setup is checked as the routes check it, because a setup
 * that would be refused on save is not worth restoring.
 */
function readValue(value: unknown, now: number): Draft | undefined {
  if (!isObject(value)) return undefined;

  const melody = parseMelodyJson(value.melody);
  if (melody === undefined) return undefined;

  if (!isObject(value.details) || typeof value.details.title !== "string") {
    return undefined;
  }
  const subtitle = value.details.subtitle;
  const instructions = value.details.instructions;
  const difficulty = value.details.difficulty;
  if (subtitle !== undefined && typeof subtitle !== "string") return undefined;
  if (instructions !== undefined && typeof instructions !== "string") {
    return undefined;
  }
  // A rating that is not one is dropped rather than the whole stash: the
  // words are the work, and the stars are a word about it.

  const setup = value.setup;
  if (!isObject(setup) || !isObject(setup.marks) || !isObject(setup.meter)) {
    return undefined;
  }
  const { clef, videoId, measures } = setup;
  const { start, end } = setup.marks;
  const { beats, beatUnit } = setup.meter;
  if (clef !== "treble" && clef !== "bass") return undefined;
  if (typeof videoId !== "string" || !VIDEO_ID.test(videoId)) return undefined;
  if (!isFinite(start) || start < 0 || !isFinite(end) || end <= start) {
    return undefined;
  }
  if (!isWhole(measures) || measures < 1) return undefined;
  if (!isWhole(beats) || beats < 1 || !isWhole(beatUnit) || beatUnit < 1) {
    return undefined;
  }

  if (value.levelId !== undefined && !isTranscriptionId(value.levelId)) {
    return undefined;
  }
  const intent = value.intent;
  if (intent !== "save" && intent !== "keep") return undefined;
  if (!isFinite(value.at) || now - value.at > KEEP_FOR_MS) return undefined;

  return {
    melody,
    details: {
      title: value.details.title,
      subtitle: textOrNothing(subtitle),
      instructions: textOrNothing(instructions),
      // Left out rather than set to nothing, so a stash from before there
      // were stars reads back exactly as it was written.
      ...(isStars(difficulty) ? { difficulty } : {}),
    },
    setup: {
      clef,
      meter: { beats, beatUnit },
      videoId,
      marks: { start, end },
      measures,
    },
    ...(value.levelId === undefined ? {} : { levelId: value.levelId }),
    intent,
    at: value.at,
  };
}

export function readDraft(storage: Storage): Draft | undefined {
  let raw: string | null;
  try {
    raw = storage.getItem(DRAFT_KEY);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return readValue(value, Date.now());
}

/**
 * Whether it was kept. The editor is about to leave the page on the strength
 * of this, so a storage that refuses — Safari in private browsing, a full
 * quota — is answered with `false` rather than a throw, and the editor stays.
 */
export function writeDraft(storage: Storage, draft: Draft): boolean {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage: Storage): void {
  try {
    storage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do: a storage that cannot be written to held nothing.
  }
}
