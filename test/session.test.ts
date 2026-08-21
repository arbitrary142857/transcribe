import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readMe } from "../dist/shared/session.js";

const USER = {
  id: "7k2m9x4p3qwt",
  email: "jason@example.com",
  isAdmin: false,
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
  });
});
