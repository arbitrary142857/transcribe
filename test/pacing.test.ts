import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stillToWait } from "../dist/ui/pacing.js";

describe("stillToWait()", () => {
  it("makes up the rest of the moment when the answer came back early", () => {
    assert.equal(stillToWait(300, 20), 280);
    assert.equal(stillToWait(300, 250), 50);
  });

  it("waits for nothing once the moment has already been spent", () => {
    assert.equal(stillToWait(300, 300), 0);
    assert.equal(stillToWait(300, 600), 0);
  });

  it("never asks for a wait, however long the answer took", () => {
    // A floor, not a delay: a slow check is never made slower for the sake of
    // a shape the visitor has already watched for a second.
    assert.ok(stillToWait(300, 5000) === 0);
  });
});
