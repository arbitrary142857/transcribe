import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseLines,
  lineRequirement,
  settledWeights,
} from "../dist/render/line-breaks.js";

/**
 * A page with comfortable room for four bars of this weight, which is roughly
 * what the score's own numbers come out at on a full-width window.
 *
 * Comfortable, not merely possible: far more bars than this will physically
 * fit in 1300, packed until the notes nearly touch. Choosing breaks against
 * that lower bar is exactly the fault these tests exist to catch.
 */
const PAGE = { usable: 1700, firstLead: 100, otherLead: 70, maxPerLine: 6 };

/** Bars all of one weight, which is what evenly-written music measures as. */
const even = (count: number, width = 200) =>
  Array.from({ length: count }, () => width);

describe("settledWeights()", () => {
  it("leaves bars of equal weight alone", () => {
    assert.deepEqual(settledWeights([100, 100, 100]), [100, 100, 100]);
  });

  it("props a thin bar up towards its share, and never robs a fat one", () => {
    const weights = settledWeights([300, 20]);
    assert.equal(weights[0], 300, "the fat bar keeps exactly what it needs");
    assert.ok(weights[1]! > 20, "the thin bar is propped up");
    assert.ok(weights[1]! < weights[0]!, "but not past the bar it stands beside");
  });

  it("has nothing to settle for a line with no bars", () => {
    assert.deepEqual(settledWeights([]), []);
  });

  it("gives a finite answer for widths that are not numbers at all", () => {
    // VexFlow measures text to size a bar, and a face that has not loaded can
    // hand back nothing. A layout must still come out.
    for (const w of settledWeights([Number.NaN, Infinity, -5, 100])) {
      assert.ok(Number.isFinite(w), `${w} is not a width`);
      assert.ok(w >= 0);
    }
  });
});

describe("lineRequirement()", () => {
  it("is the lead plus what the bars need, with breathing room", () => {
    const need = lineRequirement([200, 200], 100);
    assert.ok(need > 100 + 400, "room over the bare minimum");
    assert.ok(need < 100 + 400 * 1.2, "and not much over it");
  });

  it("costs more to mix a crowded bar with an empty one", () => {
    // The thin bar is propped up to near its share, and that room has to come
    // from somewhere: the line as a whole grows.
    const together = lineRequirement([300, 20], 0);
    const apart = lineRequirement([160, 160], 0);
    assert.ok(together > apart);
  });

  it("is just the lead when there are no bars", () => {
    assert.equal(lineRequirement([], 90), 90);
  });
});

describe("chooseLines()", () => {
  it("never leaves one bar stranded on a line of its own", () => {
    // The case this was written for: nine bars broken four-four-one left the
    // ninth stretched across a whole system.
    assert.deepEqual(chooseLines(even(9), PAGE), [3, 3, 3]);
  });

  it("will not crowd five bars onto a line just because they would fit", () => {
    // Five of these do go on a line — packed to within a whisker of touching.
    // Nine bars came out four and five that way, and the five were unreadable.
    // Three, three and three is what the room actually allows.
    const crammed = lineRequirement(even(5), 70, 1.08);
    assert.ok(crammed < PAGE.usable, "five bars physically fit");
    assert.ok(
      lineRequirement(even(5), 70, 2) > PAGE.usable,
      "but not with room to read them",
    );
    assert.deepEqual(chooseLines(even(9), PAGE), [3, 3, 3]);
  });

  it("fills the page exactly when the bars divide into it", () => {
    assert.deepEqual(chooseLines(even(8), PAGE), [4, 4]);
  });

  it("keeps a short piece on one line rather than splitting it thin", () => {
    assert.deepEqual(chooseLines(even(2), PAGE), [2]);
    assert.deepEqual(chooseLines(even(1), PAGE), [1]);
  });

  it("settles on four to a line when the music does not argue otherwise", () => {
    // Slack alone would rather have fewer, fuller lines: twelve near-empty
    // bars would come out six and six. Four is what the page drew before any
    // of this was measured, and what it should keep drawing by default.
    assert.deepEqual(chooseLines(even(12, 90), PAGE), [4, 4, 4]);
    assert.deepEqual(chooseLines(even(16, 90), PAGE), [4, 4, 4, 4]);
  });

  it("leaves four behind when the bars will not fit four to a line", () => {
    // The preference is a preference. It never widens a line past the page.
    const lines = chooseLines(even(8, 340), PAGE);
    assert.ok(Math.max(...lines) < 4, `${lines} should break sooner than four`);
    assert.equal(
      lines.reduce((sum, n) => sum + n, 0),
      8,
    );
  });

  it("puts fewer crowded bars on a line than sparse ones", () => {
    const crowded = chooseLines(even(12, 300), PAGE);
    const sparse = chooseLines(even(12, 90), PAGE);
    assert.ok(
      Math.max(...crowded) < Math.max(...sparse),
      `crowded ${crowded} should break sooner than sparse ${sparse}`,
    );
  });

  it("breaks where the music changes density, not on a fixed count", () => {
    // Four heavy bars and then eight light ones: the heavy ones cannot share a
    // line as widely as the light ones can.
    const lines = chooseLines([...even(4, 320), ...even(8, 70)], PAGE);
    assert.equal(
      lines.reduce((sum, n) => sum + n, 0),
      12,
    );
    assert.ok(lines[0]! <= 3, `the heavy bars should not crowd: ${lines}`);
    assert.ok(Math.max(...lines) >= 4, `the light bars should gather: ${lines}`);
  });

  it("never puts more bars on a line than it is allowed to", () => {
    const lines = chooseLines(even(30, 5), { ...PAGE, maxPerLine: 6 });
    assert.ok(Math.max(...lines) <= 6, `${lines}`);
    assert.equal(
      lines.reduce((sum, n) => sum + n, 0),
      30,
    );
  });

  it("still places a bar too wide for the whole page", () => {
    // Nothing can be done about it — the score is drawn wider and scaled down
    // — but it has to come back on a line rather than not at all.
    assert.deepEqual(chooseLines([5000], PAGE), [1]);
    assert.deepEqual(chooseLines([5000, 5000], PAGE), [1, 1]);
  });

  it("has no lines to give for no music", () => {
    assert.deepEqual(chooseLines([], PAGE), []);
  });

  it("always covers every bar exactly once, whatever it is given", () => {
    // The guarantee the layout rests on: every bar lands on exactly one line,
    // no line is empty, and no line is over the cap — for any widths at all,
    // including the ones that are not really widths.
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const oddities = [Number.NaN, Infinity, -Infinity, -100, 0];

    for (let round = 0; round < 400; round++) {
      const count = 1 + Math.floor(next() * 40);
      const widths = Array.from({ length: count }, () => {
        const roll = next();
        if (roll < 0.1) return oddities[Math.floor(next() * oddities.length)]!;
        return next() * 900;
      });
      const page = {
        usable: next() < 0.1 ? 0 : next() * 1600,
        firstLead: next() * 150,
        otherLead: next() * 120,
        maxPerLine: 1 + Math.floor(next() * 8),
      };

      const lines = chooseLines(widths, page);
      assert.equal(
        lines.reduce((sum, n) => sum + n, 0),
        count,
        `round ${round}: ${lines} does not cover ${count} bars`,
      );
      assert.ok(
        lines.every((n) => n >= 1 && n <= page.maxPerLine),
        `round ${round}: ${lines} breaks the cap ${page.maxPerLine}`,
      );
    }
  });

  it("survives a cap that makes no sense", () => {
    // Nothing hands it one, but a total function has to answer anyway rather
    // than loop forever looking for a line it is not allowed to fill.
    for (const maxPerLine of [0, -3, 0.5, Number.NaN]) {
      const lines = chooseLines(even(5), { ...PAGE, maxPerLine });
      assert.equal(
        lines.reduce((sum, n) => sum + n, 0),
        5,
        `cap ${maxPerLine} lost bars: ${lines}`,
      );
      assert.ok(lines.every((n) => n >= 1));
    }
  });
});
