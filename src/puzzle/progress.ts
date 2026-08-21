/**
 * Where a puzzle got to, kept between visits.
 *
 * In local storage for whoever is signed out, and in a table -- a row per
 * (player, level), with `pitches` as a JSON column, which is the shape
 * `melody` already has -- for whoever is signed in. This file is the shape
 * and the local store; `account-progress.ts` is the store that talks to the
 * table, and `handoff.ts` is how a browser's records are offered to an
 * account. docs/progress.md says how the two keepers divide the fields.
 *
 * Two things here were shaped for the table before there was one, and held.
 *
 * The first is that `ProgressStore` is asynchronous although local storage is
 * not. The cost of changing that later is not the `await` keyword: it is that
 * a synchronous store cannot fail in a way anyone needs telling about and
 * always has its answer by the time it is asked, so every call site gets
 * written assuming both. A page built on those assumptions has to be revisited
 * question by question — what do I draw while I am waiting, and what do I do
 * if it never comes — at exactly the moment there is a network to get wrong.
 * Answered early, while the answers were free, the shape was already right
 * when the network came.
 *
 * The second is that `PlayProgress` is flat and made only of things JSON has.
 * It travels as a row without a translation layer, and there is nowhere in it
 * to put anything that would not survive the trip.
 *
 * What is still the page's: the clock. Its authority moves off the page the
 * day times are compared between people, which they are not.
 */

import { isId } from "../shared/id.js";

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
  /**
   * Progress on many levels, as one question.
   *
   * The catalog asks about every level it lists at once, which over a network
   * is one request rather than a hundred. A level with no record is simply
   * absent from the map.
   */
  readMany(levelIds: readonly string[]): Promise<Map<string, PlayProgress>>;
  write(progress: PlayProgress): Promise<void>;
};

/**
 * The local store knows two things the account store does not: everything it
 * holds, and how to let go of one record. Both are for the hand-off to an
 * account, and nothing else asks.
 */
export type LocalProgressStore = ProgressStore & {
  /** Every readable record here. Unreadable ones are left out, never sent anywhere. */
  readAll(): Promise<PlayProgress[]>;
  remove(levelId: string): Promise<void>;
};

/**
 * Only what most of this needs, so a test can hand it a Map and no DOM.
 *
 * Exported because `level-density.ts` and `draft-stash.ts` keep things the
 * same way and want the same stub in their own tests.
 */
export type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * `Storage` plus the two members that let its keys be walked, which only the
 * hand-off to an account needs. The browser's has both; the other two modules
 * keeping things in local storage never ask, so they are not asked to stub
 * them.
 */
export type ListableStorage = Storage & {
  readonly length: number;
  key(index: number): string | null;
};

/**
 * The one shape of request the stores send, so a test can hand in a
 * recording — `worker/auth.ts` does the same with `TokenFetch`. The real
 * `fetch` fits it; `page-boot.ts` hands that over as `browserFetch`.
 */
export type FetchInit = {
  method: "GET" | "PUT" | "POST";
  headers: Record<string, string>;
  body?: string;
  keepalive?: boolean;
};

export type FetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type Fetch = (url: string, init: FetchInit) => Promise<FetchResponse>;

const KEY_PREFIX = "transcribe:progress:";

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
 *
 * Exported for the Worker, which holds what a page sends it to exactly this
 * standard, so the page and the server cannot disagree about what progress
 * is. One thing it does not settle, because local storage never cared: the
 * numbers may be fractional -- `elapsedMs` comes off `performance.now()` --
 * and a column that is INTEGER wants them floored, which the server does.
 */
export function readProgress(value: unknown, levelId: string): PlayProgress | undefined {
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

export function createLocalProgressStore(storage: ListableStorage): LocalProgressStore {
  const keyFor = (levelId: string) => `${KEY_PREFIX}${levelId}`;

  /**
   * The level ids this browser holds records under.
   *
   * Taken as a snapshot before anything is read, and held to being ids: a
   * stray key under the prefix must never reach the merge route, where one
   * bad id would sink the whole batch.
   */
  function heldLevelIds(): string[] {
    const ids: string[] = [];
    try {
      for (let at = 0; at < storage.length; at++) {
        const key = storage.key(at);
        if (key === null || !key.startsWith(KEY_PREFIX)) continue;
        const id = key.slice(KEY_PREFIX.length);
        if (isId(id)) ids.push(id);
      }
    } catch {
      // A storage that cannot be walked holds nothing anybody can be offered.
      return [];
    }
    return ids;
  }

  const store: LocalProgressStore = {
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

    async readMany(levelIds) {
      const many = new Map<string, PlayProgress>();
      for (const levelId of levelIds) {
        const progress = await store.read(levelId);
        if (progress !== undefined) many.set(levelId, progress);
      }
      return many;
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

    async readAll() {
      const all: PlayProgress[] = [];
      for (const levelId of heldLevelIds()) {
        const progress = await store.read(levelId);
        if (progress !== undefined) all.push(progress);
      }
      return all;
    },

    async remove(levelId) {
      try {
        storage.removeItem(keyFor(levelId));
      } catch {
        // Swallowed for the reason `write` swallows.
      }
    },
  };
  return store;
}
