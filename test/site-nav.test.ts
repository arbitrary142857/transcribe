import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cornerLabel, planNav } from "../dist/ui/site-nav.js";

describe("planNav()", () => {
  it("offers the tunes and the way to make one, and says which page this is", () => {
    const fromTunes = planNav("/tunes", false);
    const fromEditor = planNav("/edit", false);

    assert.deepEqual(
      fromTunes.map((link) => link.href),
      ["/tunes", "/edit"],
    );
    assert.deepEqual(
      fromTunes.map((link) => link.current),
      [true, false],
    );
    assert.deepEqual(
      fromEditor.map((link) => link.current),
      [false, true],
    );
  });

  it("asks a visitor who is nobody to create a transcription, in those words", () => {
    // The button on "my transcriptions" says the same thing; somebody signed
    // out has no such page, so the nav is where the invitation lives.
    assert.deepEqual(
      planNav("/tunes", false).map((link) => link.label),
      ["Tunes", "Create Transcription"],
    );
  });

  it("sends somebody signed in to their own list instead, where the button is", () => {
    // Two ways to the same editor, one of them a duplicate: the page they
    // land on carries "+ Create Transcription" itself.
    assert.deepEqual(
      planNav("/tunes", true).map((link) => link.href),
      ["/tunes", "/mine"],
    );
    assert.deepEqual(
      planNav("/tunes", true).map((link) => link.label),
      ["Tunes", "My Transcriptions"],
    );
  });

  it("marks the author's own page when that is where you are", () => {
    assert.deepEqual(
      planNav("/mine", true).map((link) => link.current),
      [false, true],
    );
  });

  it("marks nothing on the home page, which the wordmark is the way to", () => {
    // Home is not one of the nav's own places: the wordmark in the corner is
    // the door to it, and a row that marked nothing would be a row with a
    // link nobody could see they were already on.
    assert.equal(planNav("/", false).some((link) => link.current), false);
    assert.equal(planNav("/", true).some((link) => link.current), false);
  });

  it("calls a level being played no page of the nav's", () => {
    assert.equal(planNav("/play", true).some((link) => link.current), false);
  });

  it("is unmoved by a trailing slash or a query, which the dev server adds", () => {
    assert.equal(planNav("/edit/", false).find((l) => l.href === "/edit")?.current, true);
    assert.equal(planNav("/tunes/", false).find((l) => l.href === "/tunes")?.current, true);
    assert.equal(planNav("/mine/", true).find((l) => l.href === "/mine")?.current, true);
  });
});

describe("cornerLabel()", () => {
  const user = {
    id: "7k2m9x4p3qwt",
    email: "jason@example.com",
    username: "quiet-heron",
    isAdmin: false,
    choseUsername: false,
    anonymousAuthor: false,
    shareStats: true,
  };

  it("shows the name, chosen or minted alike", () => {
    assert.equal(cornerLabel(user), "quiet-heron");
    assert.equal(cornerLabel({ ...user, choseUsername: true, username: "jason" }), "jason");
  });

  it("falls back to the email only for an account that was never named", () => {
    assert.equal(cornerLabel({ ...user, username: undefined }), "jason@example.com");
  });
});
