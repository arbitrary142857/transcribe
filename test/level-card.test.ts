import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bylineOf,
  cardOpening,
  cardPlan,
  countLeft,
  keyName,
  publishBlock,
} from "../dist/ui/level-card.js";
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

describe("countLeft()", () => {
  it("says how much of a transcription is still to find", () => {
    assert.equal(countLeft(level({ unpitchedCount: 3 })), "3 notes need pitches");
  });

  it("counts one note in the singular", () => {
    assert.equal(countLeft(level({ unpitchedCount: 1 })), "1 note needs a pitch");
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
      assert.deepEqual(cardPlan(level(), who, "tunes"), {
        edit: undefined,
        publish: undefined,
        delete: false,
      });
    }
  });

  it("gives an admin on the front page the pencil to the details box, Unpublish and the trash", () => {
    assert.deepEqual(cardPlan(level(), admin(), "tunes"), {
      edit: "details",
      publish: "unpublish",
      delete: true,
    });
  });

  it("sends the author of a draft to the editor, and offers Publish", () => {
    assert.deepEqual(cardPlan(draft(), viewer(), "mine"), {
      edit: "editor",
      publish: "publish",
      delete: true,
    });
  });

  it("sends the author of a published level to the details box, and offers Unpublish", () => {
    assert.deepEqual(cardPlan(level(), viewer(), "mine"), {
      edit: "details",
      publish: "unpublish",
      delete: true,
    });
  });

  it("still offers Publish on a draft that cannot be published, for the button to say why", () => {
    // Greyed with a reason, rather than absent: a missing button explains
    // nothing, and "why can I not publish this" is the question being asked.
    const unfinished = level({ status: "draft", publishedAt: undefined, unpitchedCount: 4 });

    assert.equal(cardPlan(unfinished, viewer(), "mine").publish, "publish");
    assert.equal(cardPlan(unfinished, viewer(), "mine").edit, "editor");
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

describe("cardOpening()", () => {
  it("opens the level's box from the catalog", () => {
    assert.equal(cardOpening(level(), "tunes"), "box");
  });

  it("opens nothing for a level with no complete answer to play against", () => {
    // `/api/tunes/:id/puzzle` refuses one for the same reason.
    assert.equal(cardOpening(level({ unpitchedCount: 2 }), "tunes"), undefined);
  });

  it("takes the author straight into the editor, drafts finished or not", () => {
    // No box in between: on this page a card is work, and the thing to do with
    // work is open it. The pencil goes to the same place.
    assert.equal(cardOpening(level({ status: "draft", unpitchedCount: 4 }), "mine"), "editor");
    assert.equal(cardOpening(level({ status: "draft", unpitchedCount: 0 }), "mine"), "editor");
  });

  it("opens the box for a published level, whose music is frozen anyway", () => {
    assert.equal(cardOpening(level(), "mine"), "box");
  });
});

describe("bylineOf()", () => {
  it("names the author, and marks nobody in particular", () => {
    assert.deepEqual(bylineOf(level({ author: "quiet-heron" }), undefined), {
      name: "quiet-heron",
      mark: undefined,
    });
  });

  it("says Anonymous for an author who asked not to be named", () => {
    assert.deepEqual(bylineOf(level({ author: undefined }), undefined), {
      name: "Anonymous",
      mark: undefined,
    });
  });

  it("says Admin for a level the site itself wrote down, whatever the account is called", () => {
    // No account can be named Admin — it is a reserved username — so the word
    // comes from the flag on the row rather than from a name.
    assert.deepEqual(
      bylineOf(level({ author: "quiet-heron", authorIsAdmin: true }), undefined),
      { name: "Admin", mark: "admin" },
    );
  });

  it("marks the viewer's own levels as theirs, Anonymous or not", () => {
    const me = viewer({ id: "7k2m9x4p3qwt", username: "quiet-heron" });

    assert.deepEqual(bylineOf(level({ author: "quiet-heron" }), me), {
      name: "quiet-heron",
      mark: "you",
    });
    assert.deepEqual(bylineOf(level({ author: undefined }), me), {
      name: "Anonymous",
      mark: "you",
    });
  });

  it("lets Admin win over your own byline, on the site's own levels", () => {
    const me = viewer({ id: "7k2m9x4p3qwt", isAdmin: true });

    assert.equal(bylineOf(level({ authorIsAdmin: true }), me).mark, "admin");
  });
});

describe("publishBlock()", () => {
  const draft = (over: Partial<TranscriptionSummary> = {}) =>
    level({ status: "draft", publishedAt: undefined, authorDifficulty: 2.5, ...over });

  it("lets a finished draft with a difficulty go", () => {
    assert.equal(publishBlock(draft()), undefined);
  });

  it("asks for the pitches first, since the route and the CHECK both refuse without them", () => {
    assert.match(publishBlock(draft({ unpitchedCount: 3 }))!, /pitch/iu);
  });

  it("asks for a difficulty when that is all that is missing", () => {
    assert.match(publishBlock(draft({ authorDifficulty: undefined }))!, /difficulty/iu);
  });

  it("names the pitches first when both are missing, being the larger job", () => {
    const both = draft({ unpitchedCount: 3, authorDifficulty: undefined });

    assert.match(publishBlock(both)!, /pitch/iu);
  });
});
