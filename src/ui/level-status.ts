/**
 * The word at the top of a card, and the colour it is said in.
 *
 * Two vocabularies for two pages, because they answer two different
 * questions. The catalog asks *how far have you got with this* — Not Started,
 * In Progress, Transcribed — and reads a visitor's progress record. The
 * author's page asks *how far have you got writing this* — Unfinished,
 * Complete, Published — and reads the level's own columns. Neither ever
 * shows the other's words, which is why they are separate functions rather
 * than one with a page argument.
 *
 * Nothing cheers: these are states a level is in, not announcements, and a
 * page of cards all shouting at you is a page nobody reads.
 *
 * The tone is a role, not a colour: the stylesheet decides what "doing" looks
 * like, and the two pages use the same four names so nothing has to know that
 * a solved level and a finished draft are both green.
 */

import type { PlayProgress } from "../puzzle/progress.js";
import type { LevelStatus } from "../shared/transcription.js";
import { bucketOf } from "./level-filter.js";

/**
 * `none` is nothing done yet, `doing` is under way, `done` is finished, and
 * `live` is out in the world — the one state that is about everybody else
 * rather than about the viewer. `doing` and `live` share the site's orange:
 * one is work in hand and the other is work that went out, and both are the
 * card saying something is happening.
 */
export type StatusTone = "none" | "doing" | "done" | "live";

export type StatusWord = { text: string; tone: StatusTone };

/** Where the visitor has got to on a published level. */
export function playStatus(progress: PlayProgress | undefined): StatusWord {
  switch (bucketOf(progress)) {
    case "unplayed":
      return { text: "Not Started", tone: "none" };
    case "started":
      return { text: "In Progress", tone: "doing" };
    case "solved":
      return { text: "Transcribed", tone: "done" };
  }
}

/**
 * Where the author has got to on their own.
 *
 * Published first, because it is the fact that outranks the others: nothing
 * unfinished can be published (the database refuses it), so a published row
 * that somehow held an unpitched note is still, first of all, public.
 */
export function workStatus(level: {
  status: LevelStatus;
  unpitchedCount: number;
}): StatusWord {
  if (level.status === "published") return { text: "Published", tone: "live" };
  // Quiet rather than urgent: an unfinished draft is the ordinary state of
  // work in hand, and a page of them in the accent would be a page shouting.
  return level.unpitchedCount > 0
    ? { text: "Unfinished", tone: "none" }
    : { text: "Complete", tone: "done" };
}
