import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bracketSpot, EDGE_GAP } from "../dist/ui/section-brackets.js";

/**
 * Three events over two lines of music: two on the first, one on the second.
 *
 * The numbers are svg units, as the renderer reports them. Each event carries
 * its whole drawn width — accidentals included — because that is what a
 * bracket standing between two notes has to clear. The first note of a line
 * stands well clear of where notes may begin, as a formatted stave leaves it.
 */
const ANCHORS = [
  { line: 0, x: 36, left: 30, right: 42 },
  { line: 0, x: 76, left: 70, right: 82 },
  { line: 1, x: 36, left: 30, right: 42 },
];

const LINE = { top: 0, bottom: 100, staffTop: 20, staffBottom: 60 };
const LINES = [
  { ...LINE, left: 10, right: 200 },
  { ...LINE, left: 10, right: 200 },
];

describe("bracketSpot()", () => {
  it("opens against the note that follows the gap", () => {
    assert.deepEqual(bracketSpot(ANCHORS, LINES, 1, "start"), {
      line: 0,
      x: 70 - EDGE_GAP,
    });
  });

  it("closes against the note that precedes the gap", () => {
    assert.deepEqual(bracketSpot(ANCHORS, LINES, 1, "end"), {
      line: 0,
      x: 42 + EDGE_GAP,
    });
  });

  it("splits a gap too tight to stand its own width off either note", () => {
    // Sixteenths crowd together, and hugging one would put the line through
    // the other. Halfway is the only place clear of both, and both brackets
    // want the same halfway.
    const tight = [
      { line: 0, x: 36, left: 30, right: 42 },
      { line: 0, x: 50, left: 44, right: 56 },
    ];
    assert.deepEqual(bracketSpot(tight, LINES, 1, "start"), { line: 0, x: 43 });
    assert.deepEqual(bracketSpot(tight, LINES, 1, "end"), { line: 0, x: 43 });
  });

  it("puts each bracket on its own note's line when the gap is a line break", () => {
    // The same gap musically, two different places on the page. The opening
    // bracket belongs at the head of the line it opens; the closing one at the
    // tail of the line it closes.
    assert.deepEqual(bracketSpot(ANCHORS, LINES, 2, "start"), {
      line: 1,
      x: 30 - EDGE_GAP,
    });
    assert.deepEqual(bracketSpot(ANCHORS, LINES, 2, "end"), {
      line: 0,
      x: 82 + EDGE_GAP,
    });
  });

  it("opens at the very end when the gap is past the last note", () => {
    // There is no note after the last gap, so the bracket takes the note
    // before it instead rather than having nowhere to stand.
    assert.deepEqual(bracketSpot(ANCHORS, LINES, 3, "start"), {
      line: 1,
      x: 42 + EDGE_GAP,
    });
  });

  it("closes at the very start when the gap is before the first note", () => {
    assert.deepEqual(bracketSpot(ANCHORS, LINES, 0, "end"), {
      line: 0,
      x: 30 - EDGE_GAP,
    });
  });

  it("stays inside the stave at the head and the tail of a line", () => {
    // Never over the clef and never past the last barline. A note whose
    // accidental reaches left of where notes may begin would otherwise pull
    // the bracket out into the meter.
    const overhanging = [{ line: 0, x: 12, left: 5, right: 20 }];
    const narrow = [{ ...LINE, left: 10, right: 14 }];
    assert.deepEqual(bracketSpot(overhanging, narrow, 0, "start"), {
      line: 0,
      x: 10,
    });
    assert.deepEqual(bracketSpot(overhanging, narrow, 1, "end"), {
      line: 0,
      x: 14,
    });
  });

  it("has nowhere to stand on a score with no events", () => {
    assert.equal(bracketSpot([], LINES, 0, "start"), undefined);
    assert.equal(bracketSpot(ANCHORS, [], 1, "start"), undefined);
  });

  it("refuses a gap that is not one of the score's own", () => {
    assert.equal(bracketSpot(ANCHORS, LINES, -1, "start"), undefined);
    assert.equal(bracketSpot(ANCHORS, LINES, 4, "start"), undefined);
  });
});
