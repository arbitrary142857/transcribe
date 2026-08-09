import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitInsertion } from "../dist/ui/text-entry.js";

/**
 * The arithmetic behind refusing over-long input, kept apart from the DOM so
 * it can be tested at all.
 *
 * Everything is counted in characters rather than UTF-16 units, which is the
 * whole reason this exists instead of a `maxlength` attribute: SQLite counts
 * characters, `countCharacters` counts characters, and an attribute counting
 * something else would cut a title of family emoji at well under half its cap.
 */
describe("fitInsertion()", () => {
  const field = (value: string, start: number, end = start) => ({
    value,
    start,
    end,
  });

  it("lets a keystroke through when there is room", () => {
    assert.equal(fitInsertion(field("abc", 3), "d", 10), "d");
  });

  it("stops a keystroke dead at the cap", () => {
    // Nothing happens: no truncation to show, no character to insert.
    assert.equal(fitInsertion(field("abcde", 5), "f", 5), "");
  });

  it("counts what the selection replaces as room reclaimed", () => {
    // Three characters selected in a full field leaves room for three.
    assert.equal(fitInsertion(field("abcde", 0, 3), "xyz", 5), "xyz");
  });

  it("truncates a paste to exactly the room left", () => {
    // Rejecting the whole paste would throw away the part that fits, which is
    // usually the part somebody wanted.
    assert.equal(fitInsertion(field("abc", 3), "defghij", 5), "de");
  });

  it("measures the cap in characters, not UTF-16 units", () => {
    const family = "👨‍👩‍👧"; // 5 characters, 8 UTF-16 units
    // Five families is 25 characters; a cap of 30 leaves room for exactly one.
    assert.equal(fitInsertion(field(family.repeat(5), 40), family, 30), family);
    assert.equal(fitInsertion(field(family.repeat(6), 48), family, 30), "");
  });

  it("never splits a character in half when it truncates", () => {
    // Room for four characters and a paste of families: one whole family fits
    // and the rest is dropped, rather than four UTF-16 units of wreckage.
    const family = "👨‍👩‍👧";
    const fitted = fitInsertion(field("", 0), family.repeat(3), 7);

    assert.equal([...fitted].length, 5);
    assert.equal(fitted, family);
  });

  it("passes an empty insertion through, which is a deletion", () => {
    assert.equal(fitInsertion(field("abcde", 1, 3), "", 5), "");
  });
});
