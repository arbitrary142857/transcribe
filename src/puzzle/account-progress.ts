/**
 * The progress store for somebody signed in: the table, by way of the four
 * routes under /api/progress, with this browser's local store behind it.
 *
 * The account is the keeper, and the page is only ever a page: it sends the
 * three fields that are its to send — the clock, the pitches, the verdicts —
 * and never the check count or the solve, which the server counts and stamps
 * for itself on `/check` (docs/progress.md). A read hands back whatever the
 * server holds, the count included, which is how the page learns the server's
 * number after a reload.
 *
 * The local store is the fallback, in both directions. A save the server
 * cannot take — a session that ran out under the page, a server that cannot
 * be reached — goes into local storage instead, where the hand-off offers it
 * to the account later; the merge rule makes an old copy harmless. A read the
 * server cannot answer looks there too. What is *not* a failure: a 204, which
 * is the server saying "nothing yet", and is believed without looking locally
 * — the account is the keeper, and a local record is either already offered
 * or about to be. And a 404 on a save is dropped rather than filed: the level
 * is gone (deletion is final, and unpublishing reissues ids), so a record for
 * it could never be taken, and filing it would keep the offer alive for ever.
 *
 * Every save carries `keepalive`, so the one the play page makes on its way
 * out survives the page. There is no queue: a continuation might never run
 * after `pagehide`, and every save is a whole snapshot, so two arriving out of
 * order cost at most the few hundred milliseconds the page already accepts
 * losing. One consequence worth knowing: a record written locally by a failed
 * save can be newer than the server's, and the next load reads the server's;
 * the standing line on the catalog is what offers the newer one.
 */

import type { UserSummary } from "../shared/session.js";
import {
  readProgress,
  type Fetch,
  type LocalProgressStore,
  type PlayProgress,
  type ProgressStore,
} from "./progress.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pathOf = (levelId: string) => `/api/progress/${encodeURIComponent(levelId)}`;

export function createAccountProgressStore(options: {
  fetch: Fetch;
  /** Where a record goes when the server cannot take it, and where a read looks when the server cannot answer. */
  fallback: ProgressStore;
}): ProgressStore {
  const { fetch, fallback } = options;

  return {
    async read(levelId) {
      try {
        const response = await fetch(pathOf(levelId), {
          method: "GET",
          headers: { accept: "application/json" },
        });
        if (response.status === 204) return undefined;
        if (response.ok) {
          // An answer that is not progress is no answer, as `fetchLevel` has
          // it; what this browser holds is the next best thing.
          const progress = readProgress(await response.json(), levelId);
          if (progress !== undefined) return progress;
        }
      } catch {
        // Unreachable, or an answer that was not JSON: the same fallback.
      }
      return fallback.read(levelId);
    },

    async readMany(levelIds) {
      if (levelIds.length === 0) return new Map();
      try {
        const response = await fetch("/api/progress", {
          method: "GET",
          headers: { accept: "application/json" },
        });
        if (response.ok) {
          const body = await response.json();
          if (Array.isArray(body)) {
            const asked = new Set(levelIds);
            const many = new Map<string, PlayProgress>();
            for (const entry of body as unknown[]) {
              if (!isObject(entry) || typeof entry.levelId !== "string") continue;
              const progress = readProgress(entry, entry.levelId);
              if (progress !== undefined && asked.has(progress.levelId)) {
                many.set(progress.levelId, progress);
              }
            }
            return many;
          }
        }
      } catch {
        // As above.
      }
      return fallback.readMany(levelIds);
    },

    async write(progress) {
      try {
        const response = await fetch(pathOf(progress.levelId), {
          method: "PUT",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            elapsedMs: progress.elapsedMs,
            pitches: progress.pitches,
            judged: progress.judged,
          }),
          keepalive: true,
        });
        if (response.ok || response.status === 404) return;
      } catch {
        // Unreachable: kept here instead.
      }
      await fallback.write(progress);
    },
  };
}

/**
 * The store a page should use, given who is looking.
 *
 * Nobody gets the local store itself, untouched: anonymous play runs exactly
 * the code it always has, and never sends a request.
 */
export function progressStoreFor(
  user: UserSummary | undefined,
  ports: { fetch: Fetch; local: LocalProgressStore },
): ProgressStore {
  return user === undefined
    ? ports.local
    : createAccountProgressStore({ fetch: ports.fetch, fallback: ports.local });
}
