import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { approxEqual } from "./helpers/approx-equal.js";

describe("NoteValue", () => {
  it("defines expected denominators of a whole note", () => {
    assert.equal(NoteValue.Whole, 1);
    assert.equal(NoteValue.Half, 2);
    assert.equal(NoteValue.HalfTriplet, 3);
    assert.equal(NoteValue.Quarter, 4);
    assert.equal(NoteValue.QuarterTriplet, 6);
    assert.equal(NoteValue.Eighth, 8);
    assert.equal(NoteValue.EighthTriplet, 12);
    assert.equal(NoteValue.Sixteenth, 16);
    assert.equal(NoteValue.SixteenthTriplet, 24);
    assert.equal(NoteValue.ThirtySecond, 32);
  });
});

describe("Duration", () => {
  it("constructor: defaults dots to 0", () => {
    const duration = new Duration(NoteValue.Quarter);
    assert.equal(duration.dots, 0);
    assert.equal(duration.value, NoteValue.Quarter);
  });

  it("constructor: throws RangeError when dots is negative or noninteger", () => {
    assert.throws(
      () => new Duration(NoteValue.Quarter, -1),
      (err: unknown) =>
        err instanceof RangeError &&
        err.message === "dots must be a non-negative integer",
    );
    assert.throws(
      () => new Duration(NoteValue.Quarter, 1.5),
      (err: unknown) =>
        err instanceof RangeError &&
        err.message === "dots must be a non-negative integer",
    );
  });

  it("isEqual()", () => {
    const quarter = new Duration(NoteValue.Quarter);
    const dottedQuarter = new Duration(NoteValue.Quarter, 1);

    assert.equal(quarter.isEqual(new Duration(NoteValue.Quarter, 0)), true);
    assert.equal(quarter.isEqual(dottedQuarter), false);
    assert.equal(dottedQuarter.isEqual(new Duration(NoteValue.Quarter, 1)), true);
  });

  it("asWholeNoteFraction()", () => {
    assert.deepEqual(
      new Duration(NoteValue.Quarter).asWholeNoteFraction(),
      { num: 1, den: 4 },
    );
    assert.deepEqual(
      new Duration(NoteValue.Quarter, 1).asWholeNoteFraction(),
      { num: 3, den: 8 },
    );
    assert.deepEqual(
      new Duration(NoteValue.Half, 4).asWholeNoteFraction(),
      { num: 31, den: 32 },
    );
    assert.deepEqual(
      new Duration(NoteValue.HalfTriplet, 1).asWholeNoteFraction(),
      { num: 1, den: 2 },
    );
  });

  it("sameLengthAs()", () => {
    const quarter = new Duration(NoteValue.Quarter);
    const dottedEighth = new Duration(NoteValue.Eighth, 1);
    const eighth = new Duration(NoteValue.Eighth);

    assert.equal(quarter.sameLengthAs(new Duration(NoteValue.Quarter, 0)), true);
    assert.equal(dottedEighth.sameLengthAs(eighth), false);
  });

  it("inSeconds()", () => {
    const bpm = 96;
    const wholeNoteSeconds = (4 * 60) / bpm;

    approxEqual(
      new Duration(NoteValue.EighthTriplet, 1).inSeconds(bpm),
      (1 / 8) * wholeNoteSeconds,
    );
    approxEqual(
      new Duration(NoteValue.Sixteenth, 2).inSeconds(bpm),
      (7 / 64) * wholeNoteSeconds,
    );
  });

  it("toString()", () => {
    assert.equal(new Duration(NoteValue.Quarter).toString(), "/q");
    assert.equal(new Duration(NoteValue.Quarter, 1).toString(), "/q.");
    assert.equal(new Duration(NoteValue.Half, 2).toString(), "/h..");
    assert.equal(new Duration(NoteValue.Eighth).toString(), "/8");
    assert.equal(new Duration(NoteValue.Whole).toString(), "/w");
    assert.equal(new Duration(NoteValue.HalfTriplet).toString(), "/h");
    assert.equal(new Duration(NoteValue.SixteenthTriplet, 1).toString(), "/16.");
    assert.equal(new Duration(NoteValue.ThirtySecond).toString(), "/32");
  });
});
