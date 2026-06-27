import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { Fraction } from "../dist/music/fraction.js";
import { Tuplet } from "../dist/music/tuplet.js";
import { approxEqual } from "./helpers/approx-equal.js";

describe("NoteValue", () => {
  it("defines expected denominators of a whole note", () => {
    assert.equal(NoteValue.Whole, 1);
    assert.equal(NoteValue.Half, 2);
    assert.equal(NoteValue.Quarter, 4);
    assert.equal(NoteValue.Eighth, 8);
    assert.equal(NoteValue.Sixteenth, 16);
    assert.equal(NoteValue.ThirtySecond, 32);
  });
});

describe("Duration", () => {
  it("constructor: defaults dots to 0 and tuplet to none", () => {
    const duration = new Duration(NoteValue.Quarter);
    assert.equal(duration.dots, 0);
    assert.equal(duration.value, NoteValue.Quarter);
    assert.equal(duration.tuplet.isNone(), true);
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
    const quarterTriplet = new Duration(NoteValue.Quarter, 0, Tuplet.Triplet);

    assert.equal(quarter.isEqual(new Duration(NoteValue.Quarter, 0)), true);
    assert.equal(quarter.isEqual(dottedQuarter), false);
    assert.equal(dottedQuarter.isEqual(new Duration(NoteValue.Quarter, 1)), true);
    assert.equal(quarter.isEqual(quarterTriplet), false);
    assert.equal(
      quarterTriplet.isEqual(new Duration(NoteValue.Quarter, 0, Tuplet.Triplet)),
      true,
    );
    assert.equal(
      quarterTriplet.isEqual(
        new Duration(NoteValue.Quarter, 0, Tuplet.Quintuplet),
      ),
      false,
    );
  });

  it("asWholeNoteFraction()", () => {
    assert.deepEqual(
      new Duration(NoteValue.Quarter).asWholeNoteFraction(),
      new Fraction(1, 4),
    );
    assert.deepEqual(
      new Duration(NoteValue.Quarter, 1).asWholeNoteFraction(),
      new Fraction(3, 8),
    );
    assert.deepEqual(
      new Duration(NoteValue.Half, 4).asWholeNoteFraction(),
      new Fraction(31, 32),
    );
  });

  it("asWholeNoteFraction(): scales by the tuplet ratio", () => {
    assert.deepEqual(
      new Duration(NoteValue.Eighth, 0, Tuplet.Triplet).asWholeNoteFraction(),
      new Fraction(1, 12),
    );
    assert.deepEqual(
      new Duration(NoteValue.Quarter, 0, Tuplet.Triplet).asWholeNoteFraction(),
      new Fraction(1, 6),
    );
    assert.deepEqual(
      new Duration(
        NoteValue.Sixteenth,
        0,
        Tuplet.Quintuplet,
      ).asWholeNoteFraction(),
      new Fraction(1, 20),
    );
    assert.deepEqual(
      new Duration(NoteValue.Half, 1, Tuplet.Triplet).asWholeNoteFraction(),
      new Fraction(1, 2),
    );
  });

  it("sameLengthAs()", () => {
    const quarter = new Duration(NoteValue.Quarter);
    const dottedEighth = new Duration(NoteValue.Eighth, 1);
    const eighth = new Duration(NoteValue.Eighth);
    const eighthTriplet = new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);

    assert.equal(quarter.sameLengthAs(new Duration(NoteValue.Quarter, 0)), true);
    assert.equal(dottedEighth.sameLengthAs(eighth), false);
    assert.equal(eighth.sameLengthAs(eighthTriplet), false);
  });

  it("inSeconds()", () => {
    const bpm = 96;
    const wholeNoteSeconds = (4 * 60) / bpm;

    approxEqual(
      new Duration(NoteValue.Eighth, 1, Tuplet.Triplet).inSeconds(bpm),
      (1 / 8) * wholeNoteSeconds,
    );
    approxEqual(
      new Duration(NoteValue.Sixteenth, 2).inSeconds(bpm),
      (7 / 64) * wholeNoteSeconds,
    );
  });

  it("vexFlowToken()", () => {
    assert.equal(new Duration(NoteValue.Whole).vexFlowToken(), "w");
    assert.equal(new Duration(NoteValue.Half).vexFlowToken(), "h");
    assert.equal(new Duration(NoteValue.Quarter).vexFlowToken(), "q");
    assert.equal(new Duration(NoteValue.Eighth).vexFlowToken(), "8");
    assert.equal(new Duration(NoteValue.Sixteenth).vexFlowToken(), "16");
    assert.equal(new Duration(NoteValue.ThirtySecond).vexFlowToken(), "32");
  });

  it("vexFlowToken(): ignores dots and tuplets", () => {
    assert.equal(
      new Duration(NoteValue.Eighth, 2, Tuplet.Triplet).vexFlowToken(),
      "8",
    );
  });

  it("toString()", () => {
    assert.equal(new Duration(NoteValue.Quarter).toString(), "/q");
    assert.equal(new Duration(NoteValue.Quarter, 1).toString(), "/q.");
    assert.equal(new Duration(NoteValue.Half, 2).toString(), "/h..");
    assert.equal(new Duration(NoteValue.Eighth).toString(), "/8");
    assert.equal(new Duration(NoteValue.Whole).toString(), "/w");
    assert.equal(new Duration(NoteValue.ThirtySecond).toString(), "/32");
  });

  it("toString(): appends the tuplet ratio", () => {
    assert.equal(
      new Duration(NoteValue.Eighth, 0, Tuplet.Triplet).toString(),
      "/8{3:2}",
    );
    assert.equal(
      new Duration(NoteValue.Quarter, 0, Tuplet.Quintuplet).toString(),
      "/q{5:4}",
    );
    assert.equal(
      new Duration(NoteValue.Sixteenth, 1, Tuplet.Triplet).toString(),
      "/16.{3:2}",
    );
    assert.equal(new Duration(NoteValue.Quarter, 0, Tuplet.None).toString(), "/q");
  });
});
