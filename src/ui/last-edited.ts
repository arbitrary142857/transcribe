/**
 * When a level was last touched, said the way somebody would say it.
 *
 * Two registers, and the switch between them is the whole design. Inside a
 * week the useful fact is *how long ago* — "3 hours ago" places an edit in
 * the session you remember having — and past a week it is *when*, because
 * "eleven days ago" is a subtraction the reader has to do to learn a date
 * they could have been given.
 *
 * Pure, and `now` is an argument rather than a call to the clock, so the
 * rules can be tested at a fixed moment instead of near one. The card passes
 * `Date.now()`.
 */

/** Rounded-down counts, largest unit that fits. */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Where the relative phrase gives way to a date. */
const WEEK = 7 * DAY;

/**
 * Under this, no number: the difference between two and four seconds is not
 * worth printing, and a card redrawn a moment later would otherwise appear to
 * have been edited again.
 */
const JUST_NOW = 5 * SECOND;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** How many, and the unit named singular or plural to match. */
const count = (many: number, unit: string): string =>
  `${many} ${unit}${many === 1 ? "" : "s"} ago`;

/**
 * `1st`, `2nd`, `3rd`, `4th` — and `11th`, `12th`, `13th`, which are the
 * exception the naive rule gets wrong.
 */
function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * The day as it is spoken: `August 30th, 2026`.
 *
 * Read in the reader's own timezone, which is the only one they can check
 * against a calendar. The year is always there — a date without one is a
 * date the reader has to guess the year of, and drafts outlive a year.
 */
export function dateWords(when: number): string {
  const date = new Date(when);
  return `${MONTHS[date.getMonth()]} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

/**
 * How long ago, or the date once that stops being useful.
 *
 * A moment in the future is "just now" rather than a negative count: the two
 * clocks are the browser's and the server's, and they disagree by seconds all
 * the time.
 */
export function sinceWords(then: number, now: number): string {
  const gone = now - then;
  if (gone < JUST_NOW) return "just now";
  if (gone < MINUTE) return count(Math.floor(gone / SECOND), "second");
  if (gone < HOUR) return count(Math.floor(gone / MINUTE), "minute");
  if (gone < DAY) return count(Math.floor(gone / HOUR), "hour");
  if (gone < WEEK) return count(Math.floor(gone / DAY), "day");
  return dateWords(then);
}

/** The line a card on "my transcriptions" carries. */
export const lastEdited = (updatedAt: number, now: number): string =>
  `Last edited ${sinceWords(updatedAt, now)}`;
