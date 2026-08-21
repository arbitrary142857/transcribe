import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encode } from "../dist/editor/codec.js";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import {
  clearDraft,
  DRAFT_KEY,
  readDraft,
  writeDraft,
  type Draft,
} from "../dist/ui/draft-stash.js";

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

const C4 = new Pitch("C", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const MELODY = encode(
  new Melody(
    new KeySignature(C4, "major"),
    { beats: 4, beatUnit: 4 },
    Array.from({ length: 4 }, () => new Note(C4, QUARTER)),
  ),
);

/** Work somebody was in the middle of. */
const draft = (over: Partial<Draft> = {}): Draft => ({
  melody: JSON.parse(JSON.stringify(MELODY)),
  details: { title: "Clair de lune", subtitle: "Debussy", instructions: "" },
  setup: {
    clef: "treble",
    meter: { beats: 4, beatUnit: 4 },
    videoId: "dQw4w9WgXcQ",
    marks: { start: 12.5, end: 14.5 },
    measures: 1,
  },
  intent: "save",
  at: Date.now(),
  ...over,
});

const HOUR_MS = 60 * 60 * 1000;

describe("readDraft()", () => {
  it("hands back what writeDraft kept", () => {
    const { storage } = stubStorage();
    const kept = draft();

    writeDraft(storage, kept);

    assert.deepEqual(readDraft(storage), kept);
  });

  it("keeps the level it was work on, when it had one", () => {
    const { storage } = stubStorage();
    writeDraft(storage, draft({ levelId: "k3m9x2p7qw4t" }));

    assert.equal(readDraft(storage)?.levelId, "k3m9x2p7qw4t");
  });

  it("remembers whether the work was on its way to being saved, or only kept", () => {
    // Pressing Save and then signing in means "save this when I am back".
    // Signing in from the nav means only "do not lose this".
    const { storage } = stubStorage();
    writeDraft(storage, draft({ intent: "keep" }));
    assert.equal(readDraft(storage)?.intent, "keep");

    writeDraft(storage, draft({ intent: "save" }));
    assert.equal(readDraft(storage)?.intent, "save");
  });

  it("knows nothing when nothing was stashed", () => {
    const { storage } = stubStorage();

    assert.equal(readDraft(storage), undefined);
  });

  it("forgets anything it cannot read back as a draft", () => {
    const whole = draft();
    for (const [why, value] of [
      ["not JSON", "{not json"],
      ["null", "null"],
      ["a list", "[]"],
      ["no details", JSON.stringify({ ...whole, details: undefined })],
      ["a title that is not text", JSON.stringify({ ...whole, details: { title: 4 } })],
      ["a melody that is not one", JSON.stringify({ ...whole, melody: { events: "some" } })],
      ["a clef that is not one", JSON.stringify({ ...whole, setup: { ...whole.setup, clef: "alto" } })],
      ["a video id of the wrong shape", JSON.stringify({ ...whole, setup: { ...whole.setup, videoId: "nope" } })],
      ["marks that describe no section", JSON.stringify({ ...whole, setup: { ...whole.setup, marks: { start: 5, end: 5 } } })],
      ["a bar count that is not whole", JSON.stringify({ ...whole, setup: { ...whole.setup, measures: 2.5 } })],
      ["a meter that is not one", JSON.stringify({ ...whole, setup: { ...whole.setup, meter: { beats: 0, beatUnit: 4 } } })],
      ["a level id that could not be one", JSON.stringify({ ...whole, levelId: "../etc" })],
      ["no clock", JSON.stringify({ ...whole, at: undefined })],
      ["no saying what it was for", JSON.stringify({ ...whole, intent: undefined })],
      ["an intent that is not one", JSON.stringify({ ...whole, intent: "publish" })],
    ] as const) {
      const { storage } = stubStorage({ [DRAFT_KEY]: value });
      assert.equal(readDraft(storage), undefined, `kept ${why}`);
    }
  });

  it("keeps only the fields it knows, so nothing rides along", () => {
    const { storage } = stubStorage({
      [DRAFT_KEY]: JSON.stringify({ ...draft(), smuggled: true, setup: { ...draft().setup, extra: 1 } }),
    });

    const read = readDraft(storage)!;
    assert.equal("smuggled" in read, false);
    assert.equal("extra" in read.setup, false);
    assert.equal("levelId" in read, false);
  });

  it("ignores a stash older than a day, which nobody is coming back for", () => {
    // A draft is stashed for the minutes a sign-in takes. One found weeks later
    // is more likely a surprise than a rescue.
    const { storage } = stubStorage();
    writeDraft(storage, draft({ at: Date.now() - 25 * HOUR_MS }));
    assert.equal(readDraft(storage), undefined);

    writeDraft(storage, draft({ at: Date.now() - 23 * HOUR_MS }));
    assert.notEqual(readDraft(storage), undefined);
  });

  it("survives a storage that refuses to be read", () => {
    assert.equal(readDraft(refusing), undefined);
  });
});

describe("writeDraft()", () => {
  it("files it under a key of this project's own, and says it did", () => {
    const { held, storage } = stubStorage();

    assert.equal(writeDraft(storage, draft()), true);
    assert.ok(DRAFT_KEY.startsWith("transcribe:"));
    assert.deepEqual([...held.keys()], [DRAFT_KEY]);
  });

  it("says so when the storage refuses, rather than throwing", () => {
    // The editor is about to leave the page on the strength of this. A stash
    // that was not kept must not be sailed away from.
    assert.equal(writeDraft(refusing, draft()), false);
  });
});

describe("clearDraft()", () => {
  it("leaves nothing behind", () => {
    const { held, storage } = stubStorage();
    writeDraft(storage, draft());

    clearDraft(storage);

    assert.equal(held.size, 0);
    assert.equal(readDraft(storage), undefined);
  });

  it("survives a storage that refuses", () => {
    assert.doesNotThrow(() => clearDraft(refusing));
  });
});
