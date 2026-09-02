import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signInOffer } from "../dist/ui/sign-in-offer.js";

describe("signInOffer()", () => {
  it("carries the page you were on back to it afterwards", () => {
    assert.equal(
      signInOffer("/play?tune=dww9mbyq7234").href,
      "/api/auth/google?next=%2Fplay%3Ftune%3Ddww9mbyq7234",
    );
  });

  it("says what an account is for, since the box exists to ask for one", () => {
    // Three things a visitor cannot do signed out: write tunes, speak about
    // somebody else's, and keep progress that outlives this browser.
    const { perks } = signInOffer("/");
    assert.equal(perks.length, 3);
    assert.match(perks[0]!, /publishing/iu);
    assert.match(perks[1]!, /rating/iu);
    assert.match(perks[2]!, /progress/iu);
  });

  it("says an account can be undone, and where the rest of it is written", () => {
    // The one sentence that is not a perk: signing in is not a door that only
    // opens one way, and the page that says so in full is linked rather than
    // summarised.
    const { note } = signInOffer("/");
    assert.match(note.lead, /delete your account/iu);
    assert.equal(note.link, "Privacy Policy");
    assert.equal(note.href, "/privacy");
  });
});
