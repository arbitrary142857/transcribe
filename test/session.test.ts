import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readMe, signInPath } from "../dist/shared/session.js";

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

describe("signInPath()", () => {
  it("sends the visitor back to where they were", () => {
    assert.equal(signInPath("/mine"), "/api/auth/google?next=%2Fmine");
  });

  it("escapes a query so the level in the address survives the round trip", () => {
    const path = signInPath("/edit?level=k3m9x2p7qw4t");
    assert.equal(path, "/api/auth/google?next=%2Fedit%3Flevel%3Dk3m9x2p7qw4t");
    // What the server unpacks is what was asked for.
    assert.equal(
      new URL(path, "http://localhost").searchParams.get("next"),
      "/edit?level=k3m9x2p7qw4t",
    );
  });

  it("goes to the front page when there is nowhere to come back to", () => {
    assert.equal(signInPath(), "/api/auth/google");
  });
});
