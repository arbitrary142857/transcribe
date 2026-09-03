import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSIST_ACTIVATED,
  ASSIST_LOCKED,
  ASSIST_OFFER,
  assistPlan,
} from "../dist/ui/assist.js";

const plan = (over: Partial<Parameters<typeof assistPlan>[0]> = {}) =>
  assistPlan({ activated: false, solved: false, ...over });

describe("assistPlan()", () => {
  it("locks the two tools and offers them on a tune nobody has finished", () => {
    assert.deepEqual(plan(), { unlocked: false, row: "offer" });
  });

  it("unlocks the two tools once they have been asked for, and says so", () => {
    assert.deepEqual(plan({ activated: true }), {
      unlocked: true,
      row: "activated",
    });
  });

  it("keeps the tools unlocked on a solved tune, having nothing left to give away", () => {
    assert.equal(plan({ solved: true }).unlocked, true);
  });

  it("takes the offer away once the tune is solved, so a clean solve cannot be restamped", () => {
    assert.equal(plan({ solved: true }).row, undefined);
  });

  it("still says so on a solved tune that was assisted, which its box says too", () => {
    assert.deepEqual(plan({ activated: true, solved: true }), {
      unlocked: true,
      row: "activated",
    });
  });

  it("says the same thing about a locked tool wherever the tool is", () => {
    assert.equal(ASSIST_LOCKED, "Only available in Assist Mode!");
    assert.equal(ASSIST_OFFER, "Activate Assist Mode");
    assert.equal(ASSIST_ACTIVATED, "Assist Mode Activated");
  });
});
