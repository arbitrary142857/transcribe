import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPACT_KEY,
  readCompact,
  writeCompact,
} from "../dist/ui/level-density.js";

/**
 * Enough of `Storage` for this, and no more.
 *
 * A stub rather than the real thing because these tests run in plain Node with
 * no DOM — the same reason these functions take their storage as an argument
 * instead of reaching for `window`.
 */
function stubStorage(seed: Record<string, string> = {}) {
  const held = new Map(Object.entries(seed));
  return {
    held,
    storage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
      removeItem: (key: string) => void held.delete(key),
    },
  };
}

/** A storage that refuses, the way Safari does in private browsing. */
const refusing = {
  getItem(): string | null {
    throw new Error("denied");
  },
  setItem(): void {
    throw new Error("denied");
  },
  removeItem(): void {
    throw new Error("denied");
  },
};

describe("readCompact()", () => {
  it("shows the pictures until asked not to", () => {
    const { storage } = stubStorage();

    assert.equal(readCompact(storage), false);
  });

  it("remembers being turned on", () => {
    const { storage } = stubStorage();

    writeCompact(storage, true);

    assert.equal(readCompact(storage), true);
  });

  it("remembers being turned back off", () => {
    const { storage } = stubStorage();

    writeCompact(storage, true);
    writeCompact(storage, false);

    assert.equal(readCompact(storage), false);
  });

  it("reads anything it does not recognise as the pictures being wanted", () => {
    // Local storage is the reader's own to open and edit, and an older build of
    // this page may have left another shape in it. Neither deserves a broken
    // list, and the pictures are the ordinary way to want this screen.
    for (const held of ["", "yes", "true", "{}", "2"]) {
      const { storage } = stubStorage({ [COMPACT_KEY]: held });
      assert.equal(readCompact(storage), false, `${held} read as compact`);
    }
  });

  it("survives a storage that refuses to be read", () => {
    assert.equal(readCompact(refusing), false);
  });
});

describe("writeCompact()", () => {
  it("files it under a key of this project's own", () => {
    const { held, storage } = stubStorage();

    writeCompact(storage, true);

    assert.ok(COMPACT_KEY.startsWith("daily-transcribe:"));
    assert.deepEqual([...held.keys()], [COMPACT_KEY]);
  });

  it("survives a storage that refuses to be written to", () => {
    // Losing a preference is a nuisance; throwing out of a click is not.
    assert.doesNotThrow(() => writeCompact(refusing, true));
  });
});
