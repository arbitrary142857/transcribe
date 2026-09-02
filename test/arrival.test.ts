import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPENED_KEY, arrivedCold, markOpened } from "../dist/ui/arrival.js";

/** Session storage, as much of it as these two functions touch. */
function held(start: Record<string, string> = {}) {
  const map = new Map(Object.entries(start));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

/** One that has been denied, as a private window denies it. */
const denied = {
  getItem(): string | null {
    throw new Error("The operation is insecure.");
  },
  setItem(): void {
    throw new Error("The operation is insecure.");
  },
  removeItem(): void {},
};

const ID = "k3m9x2p7qw4t";
const OTHER = "7k2m9x4p3qwt";

describe("arrivedCold()", () => {
  it("calls an unannounced tune a cold arrival", () => {
    assert.equal(arrivedCold(held(), ID), true);
  });

  it("knows the tune whose card was just pressed", () => {
    const store = held();
    markOpened(store, ID);
    assert.equal(arrivedCold(store, ID), false);
  });

  it("takes no notice of a different tune having been opened", () => {
    const store = held();
    markOpened(store, OTHER);
    assert.equal(arrivedCold(store, ID), true);
  });

  it("counts a reload as the same arrival, not another one", () => {
    // Otherwise refreshing halfway through a tune would put the box back up
    // every time.
    const store = held();
    assert.equal(arrivedCold(store, ID), true);
    assert.equal(arrivedCold(store, ID), false);
    assert.equal(store.map.get(OPENED_KEY), ID);
  });

  it("opens the box when storage cannot be reached at all", () => {
    // A box that opens when it need not have is the mild failure; missing it
    // for somebody who arrived cold is the one worth avoiding.
    assert.equal(arrivedCold(denied, ID), true);
    assert.doesNotThrow(() => markOpened(denied, ID));
  });
});
