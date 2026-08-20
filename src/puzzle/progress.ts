/**
 * Where a puzzle got to, kept between visits.
 *
 * Local storage today because there is nobody to file it under. When there is,
 * this becomes a table — a row per (player, level), with `pitches` as a JSON
 * column, which is the shape `melody` already has.
 *
 * Two things here are shaped for that day rather than for this one.
 *
 * The first is that `ProgressStore` is asynchronous although local storage is
 * not. The cost of changing that later is not the `await` keyword: it is that
 * a synchronous store cannot fail in a way anyone needs telling about and
 * always has its answer by the time it is asked, so every call site gets
 * written assuming both. A page built on those assumptions has to be revisited
 * question by question — what do I draw while I am waiting, and what do I do
 * if it never comes — at exactly the moment there is a network to get wrong.
 * Answered now, while the answers are free, the shape is already right.
 *
 * The second is that `PlayProgress` is flat and made only of things JSON has.
 * It travels as a row without a translation layer, and there is nowhere in it
 * to put anything that would not survive the trip.
 *
 * What none of this settles, and what the database will bring with it: merging
 * a local record into an account at first sign-in, and moving the clock's
 * authority off the page once times are compared. Neither is storage.
 */

export type PlayProgress = {
  levelId: string;
  /** Time spent with the tab showing. See `stopwatch.ts`. */
  elapsedMs: number;
  checkCount: number;
  /** When it was solved, or nothing while it is not. */
  solvedAt: number | undefined;
  /** The pitches written down, keyed by event index as the melody indexes. */
  pitches: { index: number; midi: number }[];
  /**
   * Every pitch a check has judged, and what it said.
   *
   * Not merely the last verdict per note: a note told twice that it is wrong
   * has been told about two different pitches, and both remain true. Without
   * this the colouring is lost on a reload, and so is the fact that a found
   * note is settled — `locked` is exactly what came back correct.
   */
  judged: { index: number; midi: number; correct: boolean }[];
};

export type ProgressStore = {
  read(levelId: string): Promise<PlayProgress | undefined>;
  write(progress: PlayProgress): Promise<void>;
};

/**
 * Only what this file needs, so a test can hand it a Map and no DOM.
 *
 * Exported because `level-density.ts` keeps a preference the same way and wants
 * the same stub in its own tests.
 */
export type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const KEY_PREFIX = "daily-transcribe:progress:";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isWhole = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

/**
 * Whether this is progress, and a copy of it if so.
 *
 * Held to the same standard as anything arriving over the wire, and for a
 * closer version of the same reason: local storage is the player's own to open
 * and edit, and an older build of this page may have left another shape in it.
 * Neither deserves a thrown page — a puzzle that opens fresh is the right
 * answer to both — so this returns nothing rather than guessing.
 *
 * A copy built field by field, so that nothing stored alongside survives being
 * read back.
 */
function readProgress(value: unknown, levelId: string): PlayProgress | undefined {
  if (!isObject(value)) return undefined;
  // Filed under one level and claiming to be another is not progress at either.
  if (value.levelId !== levelId) return undefined;
  if (!isCount(value.elapsedMs) || !isCount(value.checkCount)) return undefined;
  if (value.solvedAt !== undefined && !isCount(value.solvedAt)) return undefined;
  if (!Array.isArray(value.pitches)) return undefined;

  const pitches: PlayProgress["pitches"] = [];
  for (const entry of value.pitches as unknown[]) {
    if (!isObject(entry)) return undefined;
    if (!isWhole(entry.index) || entry.index < 0) return undefined;
    if (!isWhole(entry.midi) || entry.midi < 0 || entry.midi > 127) {
      return undefined;
    }
    pitches.push({ index: entry.index, midi: entry.midi });
  }

  // Absent is allowed, because records written before this existed have none
  // and are otherwise perfectly good progress. Present and broken is not: the
  // rest of the record cannot be trusted either.
  const judged: PlayProgress["judged"] = [];
  if (value.judged !== undefined) {
    if (!Array.isArray(value.judged)) return undefined;
    for (const entry of value.judged as unknown[]) {
      if (!isObject(entry)) return undefined;
      if (!isWhole(entry.index) || entry.index < 0) return undefined;
      if (!isWhole(entry.midi) || entry.midi < 0 || entry.midi > 127) {
        return undefined;
      }
      if (typeof entry.correct !== "boolean") return undefined;
      judged.push({
        index: entry.index,
        midi: entry.midi,
        correct: entry.correct,
      });
    }
  }

  return {
    levelId,
    elapsedMs: value.elapsedMs,
    checkCount: value.checkCount,
    solvedAt: value.solvedAt,
    pitches,
    judged,
  };
}

export function createLocalProgressStore(storage: Storage): ProgressStore {
  const keyFor = (levelId: string) => `${KEY_PREFIX}${levelId}`;

  return {
    async read(levelId) {
      let held: string | null;
      try {
        held = storage.getItem(keyFor(levelId));
      } catch {
        // Storage can be denied outright, not merely full.
        return undefined;
      }
      if (held === null) return undefined;

      try {
        return readProgress(JSON.parse(held), levelId);
      } catch {
        return undefined;
      }
    },

    async write(progress) {
      try {
        storage.setItem(keyFor(progress.levelId), JSON.stringify(progress));
      } catch {
        // Safari in private browsing throws from setItem, and a full quota
        // throws anywhere. Losing the record of a session is a nuisance;
        // losing the note being entered when it happens is not, so this is
        // swallowed rather than raised into the middle of an edit.
      }
    },
  };
}
