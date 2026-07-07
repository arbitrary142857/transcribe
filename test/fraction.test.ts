import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { add, compare, equals, reduce } from "../dist/music/fraction.js";

describe("reduce()", () => {
  it("reduces non-lowest-terms input to lowest terms", () => {
    assert.deepEqual(reduce({ num: 2, den: 4 }), { num: 1, den: 2 });
    assert.deepEqual(reduce({ num: 6, den: 9 }), { num: 2, den: 3 });
  });

  it("ensures denominator is positive", () => {
    assert.deepEqual(reduce({ num: 1, den: -2 }), { num: -1, den: 2 });
    assert.deepEqual(reduce({ num: -2, den: -4 }), { num: 1, den: 2 });
  });
});

describe("add()", () => {
  it("adds fractions with different denominators and returns a reduced result", () => {
    assert.deepEqual(add({ num: 1, den: 2 }, { num: 1, den: 3 }), {
      num: 5,
      den: 6,
    });
    assert.deepEqual(add({ num: 1, den: 4 }, { num: 1, den: 4 }), {
      num: 1,
      den: 2,
    });
  });
});

describe("compare()", () => {
  it("treats equal-value fractions with different denominators as equal", () => {
    assert.equal(compare({ num: 1, den: 2 }, { num: 2, den: 4 }), 0);
  });

  it("returns negative, zero, or positive for less than, equal, or greater", () => {
    assert.ok(compare({ num: 1, den: 4 }, { num: 1, den: 2 }) < 0);
    assert.equal(compare({ num: 3, den: 4 }, { num: 3, den: 4 }), 0);
    assert.ok(compare({ num: 3, den: 4 }, { num: 1, den: 2 }) > 0);
  });
});

describe("equals()", () => {
  it("returns true for equal-value fractions", () => {
    assert.equal(equals({ num: 1, den: 2 }, { num: 2, den: 4 }), true);
    assert.equal(equals({ num: 3, den: 8 }, { num: 3, den: 8 }), true);
  });

  it("returns false for unequal fractions", () => {
    assert.equal(equals({ num: 1, den: 2 }, { num: 1, den: 3 }), false);
    assert.equal(equals({ num: 2, den: 3 }, { num: 3, den: 4 }), false);
  });
});
