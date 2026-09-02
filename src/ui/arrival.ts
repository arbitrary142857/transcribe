/**
 * Whether the player has just come from a list, or arrived at a puzzle cold.
 *
 * A tune's box is how somebody decides whether to play something — what it is
 * in, how long it runs, what its author wants known. Reaching `/play` from a
 * bookmark, a link, or the address bar skips all of that, so the box opens
 * itself there. Reaching it from a card means the box was just read, and
 * opening it again would be the site repeating itself.
 *
 * The signal is one key in session storage, written as the way in is taken and
 * read as the puzzle opens. Not `document.referrer`: that is exactly what
 * privacy settings, stricter referrer policies and some extensions strip, so it
 * fails for the people most likely to be surprised by a box they did not ask
 * for. Session storage is per tab and is not something a blocker touches; a new
 * tab opened from a link inherits a copy of it, so a card opened in one behaves
 * as a card opened here.
 *
 * The puzzle page writes the key for itself as well, so that a reload is not a
 * fresh arrival — a box in the face on every refresh, halfway through a tune,
 * would be the worst version of this feature.
 *
 * When storage cannot be reached at all, `arrivedCold` answers true: showing a
 * dismissable box to somebody who did not need it is the mild failure, and
 * missing it entirely for somebody who did is the one worth avoiding.
 */

import type { Storage } from "../puzzle/progress.js";

export const OPENED_KEY = "transcribe:opened";

/** Remember that this tune is being opened deliberately, from here. */
export function markOpened(storage: Storage, id: string): void {
  try {
    storage.setItem(OPENED_KEY, id);
  } catch {
    // Private windows and full quotas both throw. The cost is a box that
    // opens when it need not have, which is what the box is for anyway.
  }
}

/**
 * Whether this tune is being met for the first time in this tab — and, either
 * way, it has been met now.
 */
export function arrivedCold(storage: Storage, id: string): boolean {
  let cold = true;
  try {
    cold = storage.getItem(OPENED_KEY) !== id;
  } catch {
    cold = true;
  }
  markOpened(storage, id);
  return cold;
}
