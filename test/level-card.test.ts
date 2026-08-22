import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardPlan, keyName, levelStats, levelState } from "../dist/ui/level-card.js";
import type { UserSummary } from "../dist/shared/session.js";
import type { TranscriptionSummary } from "../dist/shared/transcription.js";

/** A level as the listing route hands one over. */
const level = (
  over: Partial<TranscriptionSummary> = {},
): TranscriptionSummary => ({
  id: "k3m9x2p7qw4t",
  title: "Clair de lune",
  subtitle: "Debussy",
  videoId: "dQw4w9WgXcQ",
  // Four bars of 4/4 across eight seconds is 120 to the beat.
  markStart: 0,
  markEnd: 8,
  measures: 4,
  clef: "treble",
  meter: { beats: 4, beatUnit: 4 },
  keyFifths: 0,
  keyMode: "major",
  noteCount: 12,
  unpitchedCount: 0,
  instructions: undefined,
  ownerId: "7k2m9x4p3qwt",
  status: "published",
  publishedAt: 1_754_500_000_000,
  updatedAt: 1_754_500_000_000,
  createdAt: 1_754_500_000_000,
  ...over,
});

describe("levelState()", () => {
  it("says nothing about a transcription with every note pitched", () => {
    // Finished is the ordinary case, and a card should not announce it.
    assert.equal(levelState(level()), undefined);
  });

  it("calls a transcription unfinished, and says how much is left", () => {
    assert.equal(
      levelState(level({ unpitchedCount: 3 })),
      "Unfinished · 3 notes need pitches",
    );
  });

  it("counts one note in the singular", () => {
    assert.equal(
      levelState(level({ unpitchedCount: 1 })),
      "Unfinished · 1 note needs a pitch",
    );
  });
});

describe("keyName()", () => {
  it("writes the key the way it is spoken, with signs and not letters", () => {
    assert.equal(keyName(level({ keyFifths: -5 })), "D♭ major");
    assert.equal(keyName(level({ keyFifths: 2 })), "D major");
    assert.equal(keyName(level({ keyFifths: 0 })), "C major");
    assert.equal(
      keyName(level({ keyFifths: 0, keyMode: "minor" })),
      "A minor",
    );
  });
});

describe("levelStats()", () => {
  /** The stats by name, since the modal places each in its own box. */
  const statsOf = (level: TranscriptionSummary) =>
    Object.fromEntries(levelStats(level).map((stat) => [stat.kind, stat]));

  it("gives each fact a number and a unit to print beside it", () => {
    // Split rather than joined, because the box sets the number large and the
    // unit small: "4" and "bars" are two different sizes of the same fact.
    assert.deepEqual(levelStats(level()), [
      { kind: "bars", label: "Bars", value: "4", unit: "bars" },
      { kind: "notes", label: "Notes", value: "12", unit: "notes" },
      { kind: "tempo", label: "Tempo", value: "120", unit: "BPM" },
      { kind: "length", label: "Length", value: "8", unit: "sec" },
    ]);
  });

  it("counts the beat a player feels, so 6/8 gets two to the bar", () => {
    // Two bars of 6/8 across two seconds: four felt beats, not twelve.
    const compound = level({
      meter: { beats: 6, beatUnit: 8 },
      measures: 2,
      markStart: 0,
      markEnd: 2,
    });

    assert.equal(statsOf(compound).tempo!.value, "120");
  });

  it("is unmoved by where in the video the section was taken from", () => {
    assert.equal(statsOf(level({ markStart: 630, markEnd: 638 })).tempo!.value, "120");
  });

  it("rounds the length to the second, as a box is read at a glance", () => {
    assert.equal(statsOf(level({ markStart: 0, markEnd: 31.6 })).length!.value, "32");
    assert.equal(statsOf(level({ markStart: 0, markEnd: 31.4 })).length!.value, "31");
  });

  it("drops the s from a single bar and a single note", () => {
    const one = level({ measures: 1, noteCount: 1, markEnd: 2 });

    assert.equal(statsOf(one).bars!.unit, "bar");
    assert.equal(statsOf(one).notes!.unit, "note");
  });

  it("leaves the tempo out when the marks describe none", () => {
    // The database will not hold such a row, so this stands against a level no
    // route can currently write rather than against one anybody will see.
    const untimed = level({ markStart: 5, markEnd: 5 });

    assert.equal("tempo" in statsOf(untimed), false);
  });

  it("says nothing about the key or the meter, which the box draws", () => {
    // Printing them here as well would be the same fact twice in one box.
    assert.deepEqual(
      levelStats(level()).map((stat) => stat.kind),
      ["bars", "notes", "tempo", "length"],
    );
  });
});

/** Somebody looking at the list. */
const viewer = (over: Partial<UserSummary> = {}): UserSummary => ({
  id: "7k2m9x4p3qwt",
  email: "jason@example.com",
  username: undefined,
  isAdmin: false,
  choseUsername: false,
  anonymousAuthor: false,
  shareStats: true,
  ...over,
});

describe("cardPlan()", () => {
  const draft = () => level({ status: "draft", publishedAt: undefined });
  const stranger = () => viewer({ id: "2b4d6f8h0j1k" });
  const admin = () => viewer({ id: "2b4d6f8h0j1k", isAdmin: true });

  it("gives a visitor to the front page the card and nothing else", () => {
    for (const who of [undefined, stranger(), viewer()]) {
      assert.deepEqual(cardPlan(level(), who, "home"), {
        draft: false,
        edit: undefined,
        publish: undefined,
        delete: false,
      });
    }
  });

  it("gives an admin on the front page the pencil to the details box and the trash, and never Publish", () => {
    assert.deepEqual(cardPlan(level(), admin(), "home"), {
      draft: false,
      edit: "details",
      publish: undefined,
      delete: true,
    });
  });

  it("sends the author of a draft to the editor, and offers Publish", () => {
    assert.deepEqual(cardPlan(draft(), viewer(), "mine"), {
      draft: true,
      edit: "editor",
      publish: "publish",
      delete: true,
    });
  });

  it("sends the author of a published level to the details box, and offers Unpublish", () => {
    assert.deepEqual(cardPlan(level(), viewer(), "mine"), {
      draft: false,
      edit: "details",
      publish: "unpublish",
      delete: true,
    });
  });

  it("calls a draft a draft, whoever is looking", () => {
    assert.equal(cardPlan(draft(), undefined, "home").draft, true);
    assert.equal(cardPlan(draft(), stranger(), "mine").draft, true);
  });

  it("offers nothing on the author's page to nobody signed in, nor to somebody else", () => {
    for (const who of [undefined, stranger()]) {
      const plan = cardPlan(draft(), who, "mine");
      assert.equal(plan.edit, undefined);
      assert.equal(plan.publish, undefined);
      assert.equal(plan.delete, false);
    }
  });

  it("lets an admin act on the author's page as the author would", () => {
    assert.deepEqual(cardPlan(draft(), admin(), "mine"), cardPlan(draft(), viewer(), "mine"));
  });
});
