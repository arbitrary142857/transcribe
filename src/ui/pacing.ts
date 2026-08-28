/**
 * How long a step is held so that it can be seen.
 *
 * Some acts finish faster than a person can register that they began. A check
 * answered in twenty milliseconds paints "Checking…" and unpaints it inside a
 * frame or two, and what the visitor sees is the score twitching for no
 * announced reason — the work reads as a glitch rather than as an answer.
 *
 * A *floor* rather than a delay: the moment is made up only when the act came
 * back inside it. Nothing slow is ever made slower.
 */

/** The moment a press is held at "Checking…", however fast the answer comes. */
export const CHECKING_MS = 300;

/** What is left of `floor` after `spent` milliseconds of it have gone. */
export const stillToWait = (floor: number, spent: number): number =>
  Math.max(0, floor - spent);
