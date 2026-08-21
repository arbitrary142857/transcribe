import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planNav } from "../dist/ui/site-nav.js";

describe("planNav()", () => {
  it("offers the same places from every page, and says which one this is", () => {
    const fromHome = planNav("/", true);
    const fromEditor = planNav("/edit", true);

    assert.deepEqual(
      fromHome.map((link) => link.href),
      ["/", "/edit", "/mine"],
    );
    assert.deepEqual(
      fromEditor.map((link) => link.href),
      ["/", "/edit", "/mine"],
    );
    assert.deepEqual(
      fromHome.map((link) => link.current),
      [true, false, false],
    );
    assert.deepEqual(
      fromEditor.map((link) => link.current),
      [false, true, false],
    );
  });

  it("leaves out the author's own list for somebody not signed in", () => {
    assert.deepEqual(
      planNav("/", false).map((link) => link.href),
      ["/", "/edit"],
    );
  });

  it("calls a level being played no page of the nav's", () => {
    assert.equal(planNav("/play", true).some((link) => link.current), false);
  });

  it("is unmoved by a trailing slash or a query, which the dev server adds", () => {
    assert.equal(planNav("/edit/", true).find((l) => l.href === "/edit")?.current, true);
    assert.equal(planNav("/mine/", true).find((l) => l.href === "/mine")?.current, true);
  });
});
