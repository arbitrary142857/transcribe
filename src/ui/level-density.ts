/**
 * Whether the level list is drawn compact, remembered between visits.
 *
 * The first thing on this site that is a *preference* rather than a record of
 * work, so it is kept apart from progress rather than filed alongside it: one
 * says what you have done and belongs to an account the day there are accounts,
 * the other says how you like to look at this page on this machine and never
 * will.
 *
 * Held to the same standard as progress all the same — see `progress.ts`, whose
 * conventions these follow. Storage can be denied outright and not merely full,
 * and what is in it is the reader's own to edit, so both directions are
 * swallowed and anything unrecognised reads as the default.
 */

import type { Storage } from "../puzzle/progress.js";

export const COMPACT_KEY = "transcribe:compact-levels";

/**
 * The one value that means compact.
 *
 * Everything else — an empty string, a stale shape, `"true"` from some build
 * that wrote it differently — reads as the pictures being wanted, which is the
 * ordinary way to want this screen and the safe thing to fall back to.
 */
const ON = "1";

export function readCompact(storage: Storage): boolean {
  try {
    return storage.getItem(COMPACT_KEY) === ON;
  } catch {
    return false;
  }
}

export function writeCompact(storage: Storage, on: boolean): void {
  try {
    storage.setItem(COMPACT_KEY, on ? ON : "0");
  } catch {
    // Safari in private browsing throws from `setItem`, and a full quota throws
    // anywhere. Losing which way the list was last drawn is a nuisance; throwing
    // out of the middle of a click is not.
  }
}
