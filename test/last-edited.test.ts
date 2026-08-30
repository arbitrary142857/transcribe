import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateWords, lastEdited, sinceWords } from "../dist/ui/last-edited.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A moment written in local time, so the expected date is the one a reader in
 * any timezone would see. A timestamp fixed in UTC would fall on the day
 * before or after for half the world, and this test would pass or fail by
 * where it was run.
 */
const at = (year: number, month: number, day: number, hour = 12): number =>
  new Date(year, month - 1, day, hour).getTime();

const NOW = at(2026, 8, 30);

describe("sinceWords()", () => {
  it("counts the seconds, and says one of them in the singular", () => {
    assert.equal(sinceWords(NOW - 5 * SECOND, NOW), "5 seconds ago");
    assert.equal(sinceWords(NOW - 59 * SECOND, NOW), "59 seconds ago");
  });

  it("calls the last few seconds just now, where a count would be noise", () => {
    assert.equal(sinceWords(NOW, NOW), "just now");
    assert.equal(sinceWords(NOW - 3 * SECOND, NOW), "just now");
  });

  it("counts minutes, then hours, then days", () => {
    assert.equal(sinceWords(NOW - MINUTE, NOW), "1 minute ago");
    assert.equal(sinceWords(NOW - 45 * MINUTE, NOW), "45 minutes ago");
    assert.equal(sinceWords(NOW - HOUR, NOW), "1 hour ago");
    assert.equal(sinceWords(NOW - 3 * HOUR, NOW), "3 hours ago");
    assert.equal(sinceWords(NOW - DAY, NOW), "1 day ago");
    assert.equal(sinceWords(NOW - 6 * DAY, NOW), "6 days ago");
  });

  it("rounds down, so an hour and fifty minutes is one hour and not two", () => {
    assert.equal(sinceWords(NOW - (HOUR + 50 * MINUTE), NOW), "1 hour ago");
  });

  it("gives the date once a week has gone by, since the count stops meaning much", () => {
    assert.equal(sinceWords(at(2026, 8, 21), NOW), "August 21st, 2026");
    assert.equal(sinceWords(at(2025, 6, 3), NOW), "June 3rd, 2025");
  });

  it("says just now for a moment in the future, which is a clock disagreeing", () => {
    // A browser whose clock runs behind the server's would otherwise read
    // "-3 seconds ago"; nothing was edited in the future.
    assert.equal(sinceWords(NOW + 5 * MINUTE, NOW), "just now");
  });
});

describe("dateWords()", () => {
  it("writes the day as it is spoken, with the year", () => {
    assert.equal(dateWords(at(2026, 8, 30)), "August 30th, 2026");
    assert.equal(dateWords(at(2026, 1, 1)), "January 1st, 2026");
  });

  it("gets the ordinals right, the teens included", () => {
    assert.equal(dateWords(at(2026, 3, 2)), "March 2nd, 2026");
    assert.equal(dateWords(at(2026, 3, 3)), "March 3rd, 2026");
    assert.equal(dateWords(at(2026, 3, 4)), "March 4th, 2026");
    assert.equal(dateWords(at(2026, 3, 11)), "March 11th, 2026");
    assert.equal(dateWords(at(2026, 3, 12)), "March 12th, 2026");
    assert.equal(dateWords(at(2026, 3, 13)), "March 13th, 2026");
    assert.equal(dateWords(at(2026, 3, 21)), "March 21st, 2026");
    assert.equal(dateWords(at(2026, 3, 22)), "March 22nd, 2026");
    assert.equal(dateWords(at(2026, 3, 23)), "March 23rd, 2026");
    assert.equal(dateWords(at(2026, 3, 31)), "March 31st, 2026");
  });
});

describe("lastEdited()", () => {
  it("is the words with the phrase in front of them", () => {
    assert.equal(lastEdited(NOW - 3 * HOUR, NOW), "Last edited 3 hours ago");
    assert.equal(lastEdited(at(2025, 6, 3), NOW), "Last edited June 3rd, 2025");
  });
});
