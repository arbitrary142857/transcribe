/**
 * Enough of the browser's `Storage` for the progress store, and no more.
 *
 * A stub rather than the real thing because these tests run in plain Node
 * with no DOM — the same reason the stores take their storage as an argument
 * instead of reaching for `window`. `held` is the map underneath, for a test
 * that wants to look at what was written or plant something to be read.
 *
 * `length` and `key` are here because the progress store walks its keys; the
 * two other modules keeping things in local storage never do, and their tests
 * keep their own three-method stubs.
 */

import type { ListableStorage } from "../../dist/puzzle/progress.js";

export function stubStorage(seed: Record<string, string> = {}): {
  held: Map<string, string>;
  storage: ListableStorage;
} {
  const held = new Map(Object.entries(seed));
  return {
    held,
    storage: {
      getItem: (key) => held.get(key) ?? null,
      setItem: (key, value) => void held.set(key, value),
      removeItem: (key) => void held.delete(key),
      get length() {
        return held.size;
      },
      key: (index) => [...held.keys()][index] ?? null,
    },
  };
}

/** A storage that refuses everything, the way a browser can. */
export const refusingStorage: ListableStorage = {
  getItem: () => {
    throw new DOMException("SecurityError");
  },
  setItem: () => {
    throw new DOMException("QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("SecurityError");
  },
  get length(): number {
    throw new DOMException("SecurityError");
  },
  key: () => {
    throw new DOMException("SecurityError");
  },
};
