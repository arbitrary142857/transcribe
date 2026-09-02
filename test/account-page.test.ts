import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anonymousAbout,
  confirmsDeletion,
  verdictSentence,
} from "../dist/ui/account-page.js";

describe("verdictSentence()", () => {
  it("has a short word for each verdict, and nothing for one still being asked", () => {
    assert.equal(verdictSentence({ kind: "available", name: "jason" }), "Available.");
    assert.equal(verdictSentence({ kind: "taken" }), "Taken.");
    assert.equal(verdictSentence({ kind: "problem", sentence: "Too short." }), "Too short.");
    assert.equal(verdictSentence({ kind: "unchanged" }), "");
    assert.equal(verdictSentence({ kind: "checking" }), "");
    assert.match(verdictSentence({ kind: "unknown" }), /could not/i);
  });
});

describe("anonymousAbout()", () => {
  it("says the byline in the name it would actually carry", () => {
    // The placeholder it replaces asked the reader to do the substitution on
    // the one page where the site already knows the answer.
    assert.match(anonymousAbout("quiet-heron"), /"Transcribed by quiet-heron\."/);
    assert.match(anonymousAbout("quiet-heron"), /"Transcribed by Anonymous\."/);
  });
});

describe("confirmsDeletion()", () => {
  it("takes the account's own name, typed out", () => {
    assert.equal(confirmsDeletion("quiet-heron", "quiet-heron"), true);
  });

  it("forgives what a paste brings with it", () => {
    // Space either side is an accident of copying, not a different answer.
    assert.equal(confirmsDeletion("  quiet-heron  ", "quiet-heron"), true);
    // The same name written the other Unicode way -- e then a combining
    // acute, which is what some keyboards send -- against the composed one.
    assert.equal(confirmsDeletion("Jose\u0301", "Jos\u00e9"), true);
  });

  it("refuses the wrong case, which is the whole of what makes this a speed bump", () => {
    assert.equal(confirmsDeletion("Quiet-Heron", "quiet-heron"), false);
  });

  it("refuses another name, and nothing at all", () => {
    assert.equal(confirmsDeletion("quick-kestrel", "quiet-heron"), false);
    assert.equal(confirmsDeletion("", "quiet-heron"), false);
    assert.equal(confirmsDeletion("   ", "quiet-heron"), false);
  });

  it("cannot be confirmed against no name", () => {
    // Nothing typed would otherwise match nothing stored, which would turn an
    // empty box into a way through.
    assert.equal(confirmsDeletion("", ""), false);
  });
});
