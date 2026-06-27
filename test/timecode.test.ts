import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTimecode, parseTimecode } from "../dist/playback/timecode.js";

describe("formatTimecode()", () => {
  it("writes minutes, seconds and milliseconds", () => {
    assert.equal(formatTimecode(132.893), "2:12.893");
  });

  it("keeps the milliseconds even when they are zero", () => {
    assert.equal(formatTimecode(132), "2:12.000");
  });

  it("writes a sub-minute time with a zero minute", () => {
    assert.equal(formatTimecode(12.893), "0:12.893");
    assert.equal(formatTimecode(0), "0:00.000");
  });

  it("writes hours only when there are hours", () => {
    assert.equal(formatTimecode(3725.5), "1:02:05.500");
    assert.equal(formatTimecode(3599.999), "59:59.999");
  });

  it("pads the middle fields once something stands before them", () => {
    assert.equal(formatTimecode(61.05), "1:01.050");
    assert.equal(formatTimecode(3601.001), "1:00:01.001");
  });

  it("rounds to the millisecond rather than truncating", () => {
    assert.equal(formatTimecode(1.9996), "0:02.000");
  });
});

describe("parseTimecode()", () => {
  it("reads minutes and seconds", () => {
    assert.equal(parseTimecode("2:12.893"), 132.893);
  });

  it("reads bare seconds", () => {
    assert.equal(parseTimecode("132.893"), 132.893);
    assert.equal(parseTimecode("12"), 12);
  });

  it("reads hours when they are given", () => {
    assert.equal(parseTimecode("1:02:05.500"), 3725.5);
  });

  it("reads a time without milliseconds", () => {
    assert.equal(parseTimecode("0:07"), 7);
    assert.equal(parseTimecode("2:12"), 132);
  });

  it("shrugs off surrounding space", () => {
    assert.equal(parseTimecode("  2:12.893  "), 132.893);
  });

  it("round-trips its own formatting", () => {
    for (const seconds of [0, 0.001, 12.893, 132.893, 3599.999, 3725.5]) {
      assert.equal(parseTimecode(formatTimecode(seconds)), seconds);
    }
  });

  it("refuses nonsense", () => {
    for (const text of [
      "",
      "   ",
      "abc",
      "1:2:3:4",
      "12:",
      ":12",
      "1:60",
      "1:61.5",
      "1:-2",
      "--3",
      "1.2.3",
      "1:02:65",
    ]) {
      assert.equal(parseTimecode(text), undefined, JSON.stringify(text));
    }
  });

  it("refuses negatives", () => {
    assert.equal(parseTimecode("-5"), undefined);
    assert.equal(parseTimecode("-1:30"), undefined);
  });

  it("allows sixty seconds only where there is nothing above it", () => {
    // "90" is a fine count of bare seconds; "1:90" is not a time anyone means.
    assert.equal(parseTimecode("90"), 90);
    assert.equal(parseTimecode("90.5"), 90.5);
    assert.equal(parseTimecode("1:90"), undefined);
  });
});
