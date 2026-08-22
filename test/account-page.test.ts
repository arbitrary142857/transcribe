import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nameSentence, verdictSentence } from "../dist/ui/account-page.js";

const user = {
  id: "7k2m9x4p3qwt",
  email: "jason@example.com",
  username: "quiet-heron",
  isAdmin: false,
  choseUsername: false,
  anonymousAuthor: false,
  shareStats: true,
};

describe("nameSentence()", () => {
  it("says a minted name was picked for you", () => {
    assert.match(nameSentence(user), /quiet-heron was picked for you/);
  });

  it("says what a chosen name does", () => {
    assert.match(nameSentence({ ...user, choseUsername: true }), /Your levels say by quiet-heron/);
  });

  it("says the name goes unshown while the author is Anonymous", () => {
    assert.match(nameSentence({ ...user, choseUsername: true, anonymousAuthor: true }), /Anonymous/);
  });
});

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
