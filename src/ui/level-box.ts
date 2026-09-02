/**
 * What a tune's own box offers, decided before anything is drawn.
 *
 * The box is opened five ways — from the catalog, from the author's own list,
 * on arriving at a puzzle from anywhere but those lists, from the (i) beside
 * the title, and by the check that solves it — and what varies between them is
 * small enough to be one table and large enough that spreading it through the
 * drawing would hide it. So the drawing asks this what to draw and the table
 * lives here, where a test can read it.
 *
 * Nothing in this file touches the DOM, and nothing in it is permission: the
 * server refuses a heart or a proposal from whoever may not give one whatever
 * this returns. `maySpeak` mirrors that refusal so the box never offers what
 * would be turned away.
 */

import type { PlayProgress } from "../puzzle/progress.js";
import { formatElapsed } from "../puzzle/stopwatch.js";
import type { UserSummary } from "../shared/session.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import { bucketOf } from "./level-filter.js";

/** Which page the box was opened on, which decides where its way back goes. */
export type BoxPage = "home" | "mine" | "play";

/**
 * What opened it.
 *
 * `browse` is a card on one of the two lists; the other three are the puzzle
 * page's — arriving at it cold, pressing the (i), and the check that solved it.
 */
export type BoxOpening = "browse" | "arrival" | "info" | "solving";

/** What pressing a button does. The caller owns how each is carried out. */
export type BoxAct = "close" | "play" | "catalog" | "edit";

export type BoxButton = {
  label: string;
  act: BoxAct;
  /** The one button in the row drawn in the site's accent. */
  accent: boolean;
};

/**
 * A piece of the line above the buttons: words, or words the accent picks out.
 *
 * "Flawlessly" is the only marked word there is, and it is marked because it
 * is the whole of what that sentence is saying.
 */
export type BoxPiece = string | { marked: string };

export type BoxPlan = {
  /** The row at the bottom right, in the order it is drawn. */
  buttons: BoxButton[];
  /** Whether one of those buttons is the author's door to the details. */
  editDetails: boolean;
  /** The words above that row, or nothing when there are none to say. */
  line: BoxPiece[] | undefined;
  /** Whether the heart and the difficulty proposal ride beside those words. */
  speak: boolean;
  /** Whether the author's instructions are drawn. */
  instructions: boolean;
  /**
   * What the left-hand box holds: the tune's signature, or — on the solve —
   * the figures the solve just earned, which are what that moment is about.
   */
  left: "signature" | "result";
  /** Whose it is, said as the byline or as a fact about the viewer. */
  byline: "own" | "author";
};

export type BoxFacts = {
  page: BoxPage;
  opening: BoxOpening;
  /** Whether the viewer wrote this tune down. */
  own: boolean;
  /** Whether the viewer may give a heart and propose a difficulty. */
  maySpeak: boolean;
  /** How far the viewer has got, from wherever their progress is kept. */
  progress: PlayProgress | undefined;
};

/** What the way in offers, given how far this tune has got. */
const WAY_IN = {
  unplayed: "Start Transcribing! →",
  started: "Continue Transcribing! →",
  solved: "View Transcription",
} as const;

/** What the way back is called, on the page it would return to. */
const WAY_BACK: Record<BoxPage, string> = {
  // From either list it closes rather than goes, and says so: you are already
  // on the page it would name, and a button that promises a journey it does
  // not make is worse for being specific about it.
  home: "Close",
  mine: "Close",
  play: "Back to Public Tunes",
};

/**
 * Whether this viewer may give a heart and propose a difficulty.
 *
 * The gate is the rating and upvote routes', mirrored: signed in, sharing
 * statistics, on a published tune they solved and did not write. The author is
 * refused because their own word is the anchor the proposals lean on, and
 * counting it twice would be counting it twice.
 */
export function maySpeak(
  level: Pick<TranscriptionSummary, "ownerId" | "status">,
  viewer: UserSummary | undefined,
  solved: boolean,
): boolean {
  return (
    viewer !== undefined &&
    viewer.shareStats &&
    solved &&
    level.status === "published" &&
    level.ownerId !== viewer.id
  );
}

export function levelBoxPlan(facts: BoxFacts): BoxPlan {
  const { page, opening, own, progress } = facts;
  const state = bucketOf(progress);
  const solving = opening === "solving";

  return {
    buttons: buttonsFor(facts, state),
    // Never from inside the puzzle: the words are the author's to change from
    // their own list, and a door to a form over a puzzle in hand is a door out
    // of the work.
    editDetails: own && page !== "play" && opening === "browse",
    line: lineFor(state, solving, progress),
    speak: state === "solved" && facts.maySpeak,
    // The solve is about what just happened, not about what to know before
    // starting; the instructions were read a while ago.
    instructions: !solving,
    left: solving ? "result" : "signature",
    byline: own ? "own" : "author",
  };
}

function buttonsFor(
  facts: BoxFacts,
  state: ReturnType<typeof bucketOf>,
): BoxButton[] {
  const { page, opening, own } = facts;

  // The (i) decides nothing and goes nowhere: it is a box you opened to read,
  // and the only thing to do with it is stop reading.
  if (opening === "info") {
    return [{ label: "Close", act: "close", accent: true }];
  }

  // The solving moment. Staying is the quiet answer and leaving is the one in
  // the accent, because the puzzle behind the box is finished and there is
  // nothing left to come back to it for.
  if (opening === "solving") {
    return [
      { label: "Stay", act: "close", accent: false },
      { label: WAY_BACK.play, act: "catalog", accent: true },
    ];
  }

  const back: BoxButton = {
    label: WAY_BACK[page],
    // From a list the way back is closing the box; from the puzzle it is an
    // address.
    act: page === "play" ? "catalog" : "close",
    accent: false,
  };
  const forward: BoxButton = {
    label: WAY_IN[state],
    // On the puzzle page the way in is the page underneath, so it is the box
    // getting out of the way.
    act: page === "play" ? "close" : "play",
    accent: true,
  };
  const edit: BoxButton[] =
    own && page !== "play"
      ? [{ label: "Edit Details", act: "edit", accent: false }]
      : [];

  return [back, ...edit, forward];
}

/**
 * The words above the buttons: how far this has got, in a sentence.
 *
 * Nothing at all before it is started — there is no news yet, and a box that
 * said so would be saying nothing at length.
 */
function lineFor(
  state: ReturnType<typeof bucketOf>,
  solving: boolean,
  progress: PlayProgress | undefined,
): BoxPiece[] | undefined {
  if (progress === undefined || state === "unplayed") return undefined;
  const spent = formatElapsed(progress.elapsedMs);

  if (state === "started") {
    return [`This tune is in progress! You have transcribed for ${spent} so far.`];
  }

  const lead = solving ? "Congratulations! You" : "You";
  return progress.checkCount === 1
    ? [`${lead} transcribed this tune `, { marked: "flawlessly" }, ` in ${spent}!`]
    : [
        `${lead} transcribed this tune in ${spent} using ${progress.checkCount} attempts!`,
      ];
}
