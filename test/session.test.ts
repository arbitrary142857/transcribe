import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANONYMOUS,
  authorLabel,
  readMe,
  signInPath,
  usernameProblem,
} from "../dist/shared/session.js";

const USER = {
  id: "7k2m9x4p3qwt",
  email: "jason@example.com",
  isAdmin: false,
  choseUsername: false,
  anonymousAuthor: false,
  shareStats: true,
};

describe("readMe()", () => {
  it("reads the signed-in answer back into a user", () => {
    assert.deepEqual(readMe({ user: USER }), { ...USER, username: undefined });
  });

  it("keeps a username when one has been chosen", () => {
    const said = readMe({ user: { ...USER, username: "jason" } });
    assert.equal(said?.username, "jason");
  });

  it("reads the signed-out answer as nobody", () => {
    assert.equal(readMe({}), undefined);
  });

  it("treats an answer that is not the shape it asked for as nobody", () => {
    // A captive portal's HTML, a proxy's error page, a half of a response:
    // whatever arrived, the corner of the page draws nobody rather than throws.
    assert.equal(readMe(undefined), undefined);
    assert.equal(readMe("<html>hotel wifi</html>"), undefined);
    assert.equal(readMe({ user: "jason" }), undefined);
    assert.equal(readMe({ user: { ...USER, id: 7 } }), undefined);
    assert.equal(readMe({ user: { ...USER, isAdmin: "yes" } }), undefined);
    assert.equal(readMe({ user: { ...USER, username: 3 } }), undefined);
    assert.equal(readMe({ user: { ...USER, shareStats: "yes" } }), undefined);
    assert.equal(readMe({ user: { ...USER, anonymousAuthor: 1 } }), undefined);
    assert.equal(readMe({ user: { ...USER, choseUsername: undefined } }), undefined);
  });

  it("carries the two settings and whether the name was chosen", () => {
    const said = readMe({
      user: { ...USER, choseUsername: true, anonymousAuthor: true, shareStats: false },
    });
    assert.equal(said?.choseUsername, true);
    assert.equal(said?.anonymousAuthor, true);
    assert.equal(said?.shareStats, false);
  });
});

describe("usernameProblem()", () => {
  it("passes an ordinary name, and says nothing about it", () => {
    for (const name of ["jason", "quiet-heron", "quiet-heron-2", "Jason_M", "ab", "毛不易", "Лунная"]) {
      assert.equal(usernameProblem(name), undefined, `refused ${name}`);
    }
  });

  it("refuses a name that is too short, too long, or nothing", () => {
    assert.notEqual(usernameProblem(""), undefined);
    assert.notEqual(usernameProblem("   "), undefined);
    assert.notEqual(usernameProblem("a"), undefined);
    assert.equal(usernameProblem("a".repeat(24)), undefined);
    assert.notEqual(usernameProblem("a".repeat(25)), undefined);
  });

  it("counts characters rather than code units, so an emoji is one character", () => {
    // Twenty-four letters that each take two code units: a count by code
    // units would call this forty-eight and refuse it.
    assert.equal(usernameProblem("𝒥".repeat(24)), undefined);
    assert.notEqual(usernameProblem("𝒥".repeat(25)), undefined);
  });

  it("refuses spaces and punctuation, and allows the underscore and the hyphen", () => {
    assert.notEqual(usernameProblem("jason mao"), undefined);
    assert.notEqual(usernameProblem("jason.mao"), undefined);
    assert.notEqual(usernameProblem("jason@mao"), undefined);
    assert.notEqual(usernameProblem("ja\nson"), undefined);
    assert.equal(usernameProblem("jason_mao-2"), undefined);
  });

  it("refuses a reserved name in any case", () => {
    for (const name of [
      "anonymous",
      "Anonymous",
      "ANONYMOUS",
      "admin",
      "Transcribe",
      "tuneup",
      "Tune-Up",
    ]) {
      assert.notEqual(usernameProblem(name), undefined, `allowed ${name}`);
    }
  });

  it("judges the trimmed, settled spelling, the way the name will be stored", () => {
    assert.equal(usernameProblem("  jason  "), undefined);
    assert.equal(usernameProblem("Cafe\u0301"), undefined);
  });
});

describe("authorLabel()", () => {
  it("names the author", () => {
    assert.equal(authorLabel("jason"), "by jason");
  });

  it("calls an author with no name to show Anonymous", () => {
    assert.equal(authorLabel(undefined), `by ${ANONYMOUS}`);
    assert.equal(ANONYMOUS, "Anonymous");
  });
});

describe("signInPath()", () => {
  it("sends the visitor back to where they were", () => {
    assert.equal(signInPath("/mine"), "/api/auth/google?next=%2Fmine");
  });

  it("escapes a query so the tune in the address survives the round trip", () => {
    const path = signInPath("/edit?tune=k3m9x2p7qw4t");
    assert.equal(path, "/api/auth/google?next=%2Fedit%3Ftune%3Dk3m9x2p7qw4t");
    // What the server unpacks is what was asked for.
    assert.equal(
      new URL(path, "http://localhost").searchParams.get("next"),
      "/edit?tune=k3m9x2p7qw4t",
    );
  });

  it("goes to the front page when there is nowhere to come back to", () => {
    assert.equal(signInPath(), "/api/auth/google");
  });
});
