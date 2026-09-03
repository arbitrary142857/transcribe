/**
 * Assist mode: what it locks, what unlocks it, and what the page says about it.
 *
 * Two of the controls on the play page do not help you transcribe so much as
 * transcribe *for* you. The piano's sound switch plays the pitch of every key
 * you press, which turns finding a note by ear into checking one against a
 * reference; "hear the notes" plays your own transcription along with the
 * video, which turns the same job into hearing whether two things match. Both
 * are genuinely useful and neither is what the puzzle is for, so they are
 * locked until the player says, in a box that explains what they do, that they
 * want them.
 *
 * The saying is kept with the rest of the progress (`PlayProgress.assisted`),
 * per tune and per player, and it only ever goes one way: nothing in the page,
 * the save, or the merge lowers it. What it costs is one line on the tune's
 * box for ever after, and a solve left out of the public medians -- a time
 * earned with the answer audible is not the same measurement as one earned
 * without it.
 *
 * Nothing in this file touches the DOM. It is the table the three places that
 * draw assist mode read -- the piano's column, the playback panel, and the row
 * under the clock -- so that they cannot disagree about when a tool is locked,
 * and so a test can read the rule without a browser. `assist-modal.ts` draws
 * the box that asks; the rest is drawn where the controls already live.
 */

/** What a locked tool says when it is pointed at or pressed. */
export const ASSIST_LOCKED = "Only available in Assist Mode!";

/** The offer, on the row under the clock. */
export const ASSIST_OFFER = "Activate Assist Mode";

/** What that row says once the offer has been taken. */
export const ASSIST_ACTIVATED = "Assist Mode Activated";

/**
 * What the tune's box says, mid-sentence, about an assisted transcription.
 *
 * Lower case and parenthesised because it is an aside inside somebody else's
 * sentence, not a badge: the sentence is about their transcription, and this
 * is one more thing true of it.
 */
export const ASSIST_ASIDE = "(with assist mode)";

/** The same fact standing on its own, over the clock the solve stopped. */
export const ASSIST_STAMP = "(With Assist Mode)";

export type AssistFacts = {
  /** Whether the player has said yes to the tools on this tune. */
  activated: boolean;
  /** Whether the tune is solved, whether just now or on a previous visit. */
  solved: boolean;
};

export type AssistPlan = {
  /** Whether the two tools may be used. */
  unlocked: boolean;
  /**
   * What stands in the row under the clock: the offer, the fact that it was
   * taken, or nothing at all.
   */
  row: "offer" | "activated" | undefined;
};

/**
 * What assist mode is doing on this tune, right now.
 *
 * Two rules beyond the obvious one, and both are about the solve.
 *
 * A solved tune unlocks the tools without anybody asking. There is nothing
 * left for them to give away — every pitch is on the stave and confirmed — and
 * hearing back what you spent an hour finding is the reward, not a shortcut to
 * it.
 *
 * And a solved tune stops *offering*. Were the offer to stand, somebody who
 * solved a tune honestly could press it afterwards, to listen, and stamp their
 * own clean solve "(with assist mode)" — a lie about how it was solved, told
 * by the page, in public. The tools open anyway on that tune, so nothing is
 * lost by taking the button away; what goes with it is the only way to make
 * the mark say something untrue.
 */
export function assistPlan(facts: AssistFacts): AssistPlan {
  const { activated, solved } = facts;
  return {
    unlocked: activated || solved,
    // Said for as long as it is true, solved or not: it is the other half of
    // the line the tune's box carries about an assisted transcription.
    row: activated ? "activated" : solved ? undefined : "offer",
  };
}
