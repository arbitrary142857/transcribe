import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planDemo } from "../dist/ui/home-demos.js";

describe("planDemo()", () => {
  it("plays the demo from its own address once it has come into view", () => {
    assert.deepEqual(planDemo("/loop-section-demo.mp4", false), {
      src: "/loop-section-demo.mp4",
      play: true,
    });
  });

  it("asks for a frame by name when motion is not wanted, and leaves it standing", () => {
    // The videos carry no poster and are not loaded until they are scrolled
    // to, so a demo that is never played has nothing to paint: the box would
    // simply be empty. The fragment names an instant, which is what makes the
    // browser fetch that much of the file and draw it.
    assert.deepEqual(planDemo("/check-answer-demo.mp4", true), {
      src: "/check-answer-demo.mp4#t=0.001",
      play: false,
    });
  });

  it("keeps the fragment off the address it plays, which would start it late", () => {
    const { src } = planDemo("/loop-section-demo.mp4", false);

    assert.equal(src.includes("#"), false);
  });
});
