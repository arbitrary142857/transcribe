import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Duration,
  notateRest,
  writtenValue,
} from "../dist/music/duration.js";
import { Fraction } from "../dist/music/fraction.js";
import type { TimeSignature } from "../dist/music/types.js";

/**
 * Expectations here come from notation practice, not from the implementation.
 * The governing rule is that rests must **show each beat**; the consequences
 * cited per test are:
 *
 * - in 4/4 a half rest may cover beats 1–2 or 3–4, but rests never group across
 *   the middle of the bar;
 * - a triple meter must expose every beat, so 3/4 has no two-beat rest at all;
 * - a compound beat's silence is a dotted rest, or a quarter rest followed by an
 *   eighth — so the first two thirds of a compound beat is one quarter rest;
 * - 12/8 alone consolidates two beats into a dotted minim, at either end only.
 *
 * Sources: Open University, *An introduction to music theory* §4.2–4.3;
 * Gould, *Behind Bars*, pp. 160–164.
 */

const FOUR_FOUR: TimeSignature = { beats: 4, beatUnit: 4 };
const THREE_FOUR: TimeSignature = { beats: 3, beatUnit: 4 };
const SIX_EIGHT: TimeSignature = { beats: 6, beatUnit: 8 };
const NINE_EIGHT: TimeSignature = { beats: 9, beatUnit: 8 };
const TWELVE_EIGHT: TimeSignature = { beats: 12, beatUnit: 8 };
const FIVE_EIGHT: TimeSignature = { beats: 5, beatUnit: 8 };

const f = (num: number, den: number) => new Fraction(num, den);
const ZERO = f(0, 1);

/** Compare by `toString`, so a failure reads as `/q, /h` rather than object dumps. */
function assertWritten(actual: Duration[], expected: string[]): void {
  assert.deepEqual(actual.map(String), expected);
}

describe("writtenValue()", () => {
  it("names a length that one written duration matches exactly", () => {
    assert.equal(String(writtenValue(f(1, 1))), "/w");
    assert.equal(String(writtenValue(f(1, 4))), "/q");
    assert.equal(String(writtenValue(f(1, 32))), "/32");
    assert.equal(String(writtenValue(f(3, 8))), "/q.");
    assert.equal(String(writtenValue(f(3, 16))), "/8.");
    assert.equal(String(writtenValue(f(7, 8))), "/h..");
  });

  it("returns undefined for a length no single duration writes", () => {
    assert.equal(writtenValue(f(5, 16)), undefined);
    assert.equal(writtenValue(f(5, 8)), undefined);
    assert.equal(writtenValue(f(1, 64)), undefined);
  });

  it("tests whether a tuplet ratio divides a length evenly", () => {
    // Dividing a quarter 3:2 gives members written as eighths: the written
    // value is the divided length over `inTimeOf`, and it must have a name.
    assert.equal(String(writtenValue(f(1, 8))), "/8");
    // A dotted quarter divided 3:2 gives dotted-eighth members.
    assert.equal(String(writtenValue(f(3, 16))), "/8.");
    // The member's *sounding* length has no name, which is why a ratio exists.
    assert.equal(writtenValue(f(1, 12)), undefined);
  });
});

describe("notateRest()", () => {
  it("writes a full bar at its true length, not as a whole rest", () => {
    // A bar of silence prints as a whole rest whatever the meter, but that is a
    // glyph convention, not a length: a `Duration` must always sound what it
    // says, or measure arithmetic and playback both go wrong. Choosing the
    // glyph is left to the renderer, which can draw a semibreve rest over a
    // duration that still measures three quarters.
    assertWritten(notateRest(f(1, 1), ZERO, FOUR_FOUR), ["/w"]);
    assertWritten(notateRest(f(3, 4), ZERO, THREE_FOUR), ["/h."]);
    assertWritten(notateRest(f(3, 4), ZERO, SIX_EIGHT), ["/h."]);
    assertWritten(notateRest(f(3, 2), ZERO, TWELVE_EIGHT), ["/w."]);
    assertWritten(notateRest(f(9, 8), ZERO, NINE_EIGHT), ["/q.", "/q.", "/q."]);
    assertWritten(notateRest(f(5, 8), ZERO, FIVE_EIGHT), ["/h", "/8"]);
  });

  it("writes nothing for a zero-length span", () => {
    assertWritten(notateRest(ZERO, ZERO, FOUR_FOUR), []);
  });

  it("4/4: allows a half rest over beats 1-2 and over beats 3-4", () => {
    assertWritten(notateRest(f(1, 2), ZERO, FOUR_FOUR), ["/h"]);
    assertWritten(notateRest(f(1, 2), f(1, 2), FOUR_FOUR), ["/h"]);
  });

  it("4/4: never groups a rest across the middle of the bar", () => {
    // Beats 2-3 are two beats long but straddle the half-bar boundary.
    assertWritten(notateRest(f(1, 2), f(1, 4), FOUR_FOUR), ["/q", "/q"]);
  });

  it("4/4: writes three beats by where they start, not only how long", () => {
    assertWritten(notateRest(f(3, 4), ZERO, FOUR_FOUR), ["/h", "/q"]);
    assertWritten(notateRest(f(3, 4), f(1, 4), FOUR_FOUR), ["/q", "/h"]);
  });

  it("4/4: shows each beat rather than writing a dotted rest", () => {
    // A dotted quarter from the downbeat would swallow the start of beat 2.
    assertWritten(notateRest(f(3, 8), ZERO, FOUR_FOUR), ["/q", "/8"]);
    assertWritten(notateRest(f(3, 8), f(1, 8), FOUR_FOUR), ["/8", "/q"]);
  });

  it("4/4: groups rests shorter than a beat in half-beats", () => {
    assertWritten(notateRest(f(1, 4), f(1, 8), FOUR_FOUR), ["/8", "/8"]);
    assertWritten(notateRest(f(1, 8), f(1, 16), FOUR_FOUR), ["/16", "/16"]);
  });

  it("4/4: writes a single beat as one rest", () => {
    assertWritten(notateRest(f(1, 4), f(1, 4), FOUR_FOUR), ["/q"]);
    assertWritten(notateRest(f(1, 8), f(7, 8), FOUR_FOUR), ["/8"]);
  });

  it("3/4: exposes every beat, so two beats are two rests", () => {
    assertWritten(notateRest(f(1, 2), ZERO, THREE_FOUR), ["/q", "/q"]);
    assertWritten(notateRest(f(1, 2), f(1, 4), THREE_FOUR), ["/q", "/q"]);
  });

  it("3/8: is simple triple, not compound, so it exposes every beat", () => {
    const threeEight: TimeSignature = { beats: 3, beatUnit: 8 };
    assertWritten(notateRest(f(1, 4), ZERO, threeEight), ["/8", "/8"]);
  });

  it("6/8: writes a whole compound beat as a dotted rest", () => {
    assertWritten(notateRest(f(3, 8), ZERO, SIX_EIGHT), ["/q."]);
    assertWritten(notateRest(f(3, 8), f(3, 8), SIX_EIGHT), ["/q."]);
  });

  it("6/8: writes the first two thirds of a beat as a quarter rest", () => {
    assertWritten(notateRest(f(1, 4), ZERO, SIX_EIGHT), ["/q"]);
    assertWritten(notateRest(f(1, 4), f(3, 8), SIX_EIGHT), ["/q"]);
  });

  it("6/8: writes the last two thirds of a beat as two eighth rests", () => {
    // A quarter rest here would start off the beat's own division.
    assertWritten(notateRest(f(1, 4), f(1, 8), SIX_EIGHT), ["/8", "/8"]);
    assertWritten(notateRest(f(1, 4), f(1, 2), SIX_EIGHT), ["/8", "/8"]);
  });

  it("6/8: shows the beat when a span straddles the two beats", () => {
    assertWritten(notateRest(f(3, 8), f(1, 4), SIX_EIGHT), ["/8", "/q"]);
  });

  it("9/8: keeps beats separate, having no consolidation rule", () => {
    assertWritten(notateRest(f(3, 8), ZERO, NINE_EIGHT), ["/q."]);
    assertWritten(notateRest(f(3, 4), ZERO, NINE_EIGHT), ["/q.", "/q."]);
  });

  it("12/8: consolidates two beats into a dotted minim at either end", () => {
    assertWritten(notateRest(f(3, 4), ZERO, TWELVE_EIGHT), ["/h."]);
    assertWritten(notateRest(f(3, 4), f(3, 4), TWELVE_EIGHT), ["/h."]);
  });

  it("12/8: does not consolidate across the middle of the bar", () => {
    assertWritten(notateRest(f(3, 4), f(3, 8), TWELVE_EIGHT), ["/q.", "/q."]);
  });

  it("5/8: groups as four eighths plus one", () => {
    assertWritten(notateRest(f(1, 2), ZERO, FIVE_EIGHT), ["/h"]);
    assertWritten(notateRest(f(1, 8), f(1, 2), FIVE_EIGHT), ["/8"]);
  });

  it("never opens with a rest reaching back before where it starts", () => {
    // Off the beat, so the first piece has to end on the next boundary.
    assertWritten(notateRest(f(7, 16), f(1, 16), FOUR_FOUR), [
      "/16",
      "/8",
      "/q",
    ]);
  });

  it("throws RangeError when the span runs past the end of the bar", () => {
    assert.throws(
      () => notateRest(f(1, 1), f(1, 4), FOUR_FOUR),
      (error: unknown) =>
        error instanceof RangeError && /runs past the end/.test(error.message),
    );
  });

  it("throws RangeError for a length off the writable grid", () => {
    // A tuplet's own length: no arrangement of plain rests writes it.
    assert.throws(() => notateRest(f(1, 12), ZERO, FOUR_FOUR), RangeError);
    assert.throws(() => notateRest(f(1, 64), ZERO, FOUR_FOUR), RangeError);
  });

  it("throws RangeError for a position off the writable grid", () => {
    assert.throws(() => notateRest(f(1, 4), f(1, 12), FOUR_FOUR), RangeError);
  });

  it("throws RangeError for a negative length or position", () => {
    assert.throws(() => notateRest(f(-1, 4), ZERO, FOUR_FOUR), RangeError);
    assert.throws(() => notateRest(f(1, 4), f(-1, 4), FOUR_FOUR), RangeError);
  });

  it("writes exactly the length asked for, from every position", () => {
    const meters = [
      FOUR_FOUR,
      THREE_FOUR,
      SIX_EIGHT,
      NINE_EIGHT,
      TWELVE_EIGHT,
      FIVE_EIGHT,
    ];
    for (const meter of meters) {
      const bar = new Fraction(meter.beats, meter.beatUnit);
      for (let start = 0; f(start, 16).compare(bar) < 0; start++) {
        const from = f(start, 16);
        for (let span = 0; from.add(f(span, 16)).compare(bar) <= 0; span++) {
          const length = f(span, 16);
          const total = notateRest(length, from, meter).reduce(
            (sum, duration) => sum.add(duration.asWholeNoteFraction()),
            ZERO,
          );
          assert.equal(
            total.toString(),
            length.reduce().toString(),
            `${meter.beats}/${meter.beatUnit}: ${length} from ${from}`,
          );
        }
      }
    }
  });
});
