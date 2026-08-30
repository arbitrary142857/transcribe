import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readMeter } from "../dist/ui/meter-field.js";

describe("readMeter()", () => {
  it("reads the meter the two boxes name", () => {
    assert.deepEqual(readMeter("4", "4"), {
      meter: { beats: 4, beatUnit: 4 },
      wrong: [],
    });
    assert.deepEqual(readMeter("12", "8"), {
      meter: { beats: 12, beatUnit: 8 },
      wrong: [],
    });
  });

  it("takes every beat unit a note value names", () => {
    for (const unit of [2, 4, 8, 16]) {
      assert.deepEqual(readMeter("3", String(unit)).meter, {
        beats: 3,
        beatUnit: unit,
      });
    }
  });

  it("refuses a beat unit no note value names", () => {
    for (const unit of ["1", "3", "5", "6", "12", "32"]) {
      assert.deepEqual(readMeter("3", unit), { wrong: ["bottom"] });
    }
  });

  it("counts from one to thirty-one over the beat unit", () => {
    assert.equal(readMeter("1", "4").meter?.beats, 1);
    assert.equal(readMeter("31", "4").meter?.beats, 31);
  });

  it("refuses a count of nought, or of thirty-two and up", () => {
    assert.deepEqual(readMeter("0", "4"), { wrong: ["top"] });
    assert.deepEqual(readMeter("32", "4"), { wrong: ["top"] });
    assert.deepEqual(readMeter("64", "4"), { wrong: ["top"] });
  });

  it("refuses what is not two digits of a whole number", () => {
    for (const top of ["4.5", "four", "-4", "1e1", "004", "4/4"]) {
      assert.deepEqual(readMeter(top, "4"), { wrong: ["top"] });
    }
  });

  it("reads a box that was typed into with spaces around it", () => {
    assert.deepEqual(readMeter(" 6 ", " 8 ").meter, { beats: 6, beatUnit: 8 });
  });

  it("calls an empty box unfilled rather than wrong", () => {
    assert.deepEqual(readMeter("", ""), { wrong: [] });
    assert.deepEqual(readMeter("4", ""), { wrong: [] });
    assert.deepEqual(readMeter("", "4"), { wrong: [] });
  });

  it("says which of the two boxes is wrong, and names both when both are", () => {
    assert.deepEqual(readMeter("40", "4"), { wrong: ["top"] });
    assert.deepEqual(readMeter("4", "5"), { wrong: ["bottom"] });
    assert.deepEqual(readMeter("40", "5"), { wrong: ["top", "bottom"] });
  });

  it("has no meter to give while either box is wrong", () => {
    assert.equal(readMeter("40", "4").meter, undefined);
    assert.equal(readMeter("4", "5").meter, undefined);
  });
});
