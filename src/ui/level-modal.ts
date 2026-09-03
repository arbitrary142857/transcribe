/**
 * A tune's own box: what it is, how it has been received, and the way in.
 *
 * Opened five ways and it is one box every time — from either list of cards,
 * on arriving at a puzzle cold, from the (i) beside the title, and by the check
 * that solves it. `levelBoxPlan` decides what each of those offers; this file
 * draws it and nothing else, so the differences between the five live in one
 * table rather than in a dozen conditions spread through the drawing.
 *
 * It is laid out as the sheet is: the title centred and large, the subtitle
 * centred and smaller under it, because a reader's eye already goes there for
 * those two things and the box is about the same piece of music the sheet head
 * names. Then what the author wants known, then what the music is and how it
 * has gone for everybody, then — along the foot — whose it is and where to go.
 */

import { keyForFifths } from "../music/key-signature.js";
import { renderStaveDiagram } from "../render/stave-diagram.js";
import type { PlayProgress } from "../puzzle/progress.js";
import { formatElapsed } from "../puzzle/stopwatch.js";
import type { UserSummary } from "../shared/session.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import { markOpened } from "./arrival.js";
import { ASSIST_STAMP } from "./assist.js";
import { displayedDifficulty } from "../shared/difficulty.js";
import { createDifficulty, createUnratedDifficulty } from "./difficulty.js";
import { flagIcon, heartIcon } from "./icons.js";
import {
  bylineOf,
  countFigure,
  heartsSaid,
  keyName,
  solversSaid,
} from "./level-card.js";
import {
  levelBoxPlan,
  maySpeak,
  type BoxOpening,
  type BoxPage,
  type BoxPiece,
} from "./level-box.js";
import { openInfoModal } from "./modal.js";
import { difficultyProposal } from "./rating-prompt.js";
import { likeButton } from "./upvote-line.js";

/**
 * Room on the stave for a clef, seven accidentals and a meter.
 *
 * The key diagram's own width plus what a time signature takes beside it. One
 * drawing rather than the two this box used to set side by side: a clef, a key
 * and a meter are how a piece of music opens, and three panels for the opening
 * of one stave was three boxes saying one thing.
 */
const SIGNATURE_WIDTH = 176;

/** Ink above the top line and below the bottom one, for a clef's reach. */
const SIGNATURE_HEADROOM = { above: 28, below: 26 };

/**
 * How many stave units go in a rem. Fewer draws the stave larger; this is what
 * makes the diagram read as notation rather than as an icon of some.
 */
const UNITS_PER_REM = 13;

export type LevelModalOptions = {
  /** Everything the box is about. */
  level: TranscriptionSummary;
  /** What the author wrote, if they wrote anything. */
  instructions: string | undefined;
  /** Which page the box was opened on, and what opened it. */
  page: BoxPage;
  opening: BoxOpening;
  /** Who is looking, so the box knows whose tune this is and who may speak. */
  viewer: UserSummary | undefined;
  /** How far the viewer has got, from wherever their progress is kept. */
  progress: PlayProgress | undefined;
  /** The author's door to the words. Only ever asked for from a list. */
  onEditDetails?: () => void;
  /** Called once the box has gone, however it went. */
  onClose?: () => void;
};

export function openLevelModal(options: LevelModalOptions): void {
  const { level, viewer, progress } = options;
  const own = viewer !== undefined && viewer.id === level.ownerId;
  const solved = progress?.solvedAt !== undefined;

  const plan = levelBoxPlan({
    page: options.page,
    opening: options.opening,
    own,
    maySpeak: maySpeak(level, viewer, solved),
    progress,
  });

  openInfoModal({
    className: "level-modal",
    onClose: options.onClose,
    // Nothing in here closes the box but its own buttons; the shell's × does,
    // along with Escape and the backdrop.
    fill(close) {
      const parts: Node[] = [head(level)];

      if (plan.instructions && options.instructions !== undefined) {
        parts.push(instructionsBox(options.instructions));
      }

      parts.push(
        facts(level, plan.left === "result" ? resultBox(progress) : signatureBox(level)),
      );

      const hearts = heartCount(level);

      if (plan.line !== undefined || plan.speak) {
        parts.push(
          doings(
            plan.line,
            plan.speak
              ? [likeButton({ level, onChange: hearts.move }), difficultyProposal(level)]
              : [],
          ),
        );
      }

      parts.push(foot(options, plan, hearts.element, close));
      return parts;
    },
  });
}

/**
 * The masthead, as the sheet prints one: the name centred and large, and what
 * it is from centred and smaller beneath.
 *
 * No byline here, unlike the sheet's: who wrote it down is one of the facts
 * along the foot, beside the figures their work has earned.
 */
function head(level: TranscriptionSummary): HTMLElement {
  const element = document.createElement("div");
  element.className = "level-modal-head";

  const title = document.createElement("h2");
  title.className = "modal-title level-modal-title";
  title.textContent = level.title;
  element.append(title);

  if (level.subtitle !== undefined && level.subtitle !== "") {
    const subtitle = document.createElement("p");
    subtitle.className = "level-modal-subtitle";
    subtitle.textContent = level.subtitle;
    element.append(subtitle);
  }

  return element;
}

/**
 * What the author wants known, in a box that scrolls.
 *
 * Without an edge, text that ran past the room simply stopped partway down the
 * dialog, which reads as cut off rather than as more to come. Focusable,
 * because a region that scrolls has to be reachable by keyboard too.
 */
function instructionsBox(instructions: string): HTMLElement {
  const boxed = document.createElement("div");
  boxed.className = "level-instructions-box";
  boxed.tabIndex = 0;

  const body = document.createElement("p");
  body.className = "level-instructions";
  // Set as text, with the line breaks kept by `white-space: pre-wrap` rather
  // than by turning newlines into markup.
  body.textContent = instructions;

  boxed.append(body);
  return boxed;
}

/** The two columns: one drawn fact at the left, three measured ones at the right. */
function facts(level: TranscriptionSummary, left: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "level-facts";

  const median = factBox("Median time");
  const flawless = factBox("Median flawless");
  // A dash until — and unless — the figures arrive.
  median.show(undefined);
  flawless.show(undefined);

  const difficulty = factBox("Difficulty");
  const displayed = displayedDifficulty(level);
  difficulty.value.append(
    displayed === undefined ? createUnratedDifficulty() : createDifficulty(displayed),
  );

  const column = document.createElement("div");
  column.className = "level-facts-column";
  column.append(median.element, flawless.element, difficulty.element);

  row.append(left, column);

  // The medians arrive after the box has drawn, and are absent on purpose
  // while too few sharing players have solved it — the dash is what nothing
  // looks like, not only what waiting looks like.
  void (async () => {
    try {
      const response = await fetch(
        `/api/tunes/${encodeURIComponent(level.id)}/stats`,
        { headers: { accept: "application/json" } },
      );
      if (!response.ok) return;
      const said = (await response.json()) as {
        medianSolveMs?: number;
        medianFlawlessMs?: number;
      };
      median.show(said.medianSolveMs);
      flawless.show(said.medianFlawlessMs);
    } catch {
      // The dashes stand; they were the truth a moment ago too.
    }
  })();

  return row;
}

/** One labelled figure, empty until something is put in it. */
function factBox(label: string): {
  element: HTMLElement;
  value: HTMLElement;
  show(ms: number | undefined): void;
} {
  const element = document.createElement("div");
  element.className = "level-fact";

  const name = document.createElement("p");
  name.className = "level-fact-label";
  name.textContent = label;

  const value = document.createElement("p");
  value.className = "level-fact-value";

  element.append(name, value);
  return {
    element,
    value,
    show(ms) {
      const said = ms === undefined ? "—" : formatElapsed(ms);
      value.textContent = said;
      element.setAttribute("aria-label", `${label}: ${said}`);
    },
  };
}

/**
 * How the music opens, drawn rather than named, with the key named under it.
 *
 * Notation is quicker to recognise than to read: four sharps is a picture where
 * "E major" is a fact to recall. The caption is there for the one thing the
 * drawing genuinely cannot say — a signature of no accidentals is A minor as
 * readily as C major — so it names the key alone. The meter and the clef are
 * unambiguous on the stave and printing them again would be the same fact
 * twice.
 */
function signatureBox(level: TranscriptionSummary): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "level-fact level-signature";
  const said = `${keyName(level)}, ${level.meter.beats}/${level.meter.beatUnit}, ${level.clef} clef`;
  panel.setAttribute("role", "img");
  panel.setAttribute("aria-label", said);
  panel.title = said;

  const staff = document.createElement("div");
  staff.className = "level-stave";
  // Sized from the diagram's own width rather than left to fill the panel: the
  // svg draws to whatever room it is given, so the scale is decided here.
  staff.style.width = `${SIGNATURE_WIDTH / UNITS_PER_REM}rem`;
  renderStaveDiagram(
    staff,
    SIGNATURE_WIDTH,
    (stave) => {
      stave.addClef(level.clef);
      stave.addKeySignature(
        keyForFifths(level.keyFifths, level.keyMode).toString(),
      );
      stave.addTimeSignature(`${level.meter.beats}/${level.meter.beatUnit}`);
    },
    SIGNATURE_HEADROOM,
  );

  // A caption, so set as one: plain text under the drawing rather than the
  // chip the key chooser wears, which is a control's look and would read here
  // as the one piece of furniture from another screen.
  const named = document.createElement("p");
  named.className = "level-signature-name";
  named.textContent = keyName(level);

  panel.append(staff, named);
  return panel;
}

/**
 * What the solve just earned, where the signature usually is.
 *
 * The moment the check comes back is about the clock and the count, not about
 * what key the piece was in; that is what the box is for the rest of the time.
 *
 * An assisted solve says so above its own clock, in assist mode's blue and at
 * the size of the word under it — the qualification on the figure belongs
 * where the figure is read, not only in the sentence further down. Set upright
 * rather than italic: "Flawless!" is an exclamation and this is a condition.
 */
function resultBox(progress: PlayProgress | undefined): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "level-fact level-result";

  if (progress?.assisted === true) {
    const stamp = document.createElement("p");
    stamp.className = "level-result-assist";
    stamp.textContent = ASSIST_STAMP;
    panel.append(stamp);
  }

  const time = document.createElement("p");
  time.className = "level-result-time";
  time.textContent = formatElapsed(progress?.elapsedMs ?? 0);

  const attempts = document.createElement("p");
  attempts.className = "level-result-attempts";
  const count = progress?.checkCount ?? 0;
  const flawless = count === 1;
  attempts.textContent = flawless
    ? "Flawless!"
    : `${count} attempts`;
  attempts.classList.toggle("is-flawless", flawless);

  panel.append(time, attempts);
  return panel;
}

/** The line above the buttons: how it has gone, and what the viewer may say. */
function doings(
  line: BoxPiece[] | undefined,
  controls: readonly HTMLElement[],
): HTMLElement {
  const row = document.createElement("div");
  row.className = "level-modal-doings";

  const words = document.createElement("p");
  words.className = "level-modal-line";
  for (const piece of line ?? []) {
    if (typeof piece === "string") {
      words.append(piece);
    } else if ("assist" in piece) {
      // Assist mode's own blue, upright: an aside about how the tune was
      // transcribed, not a word to lean on. A `span` rather than the accent's
      // `em`, since nothing here is being emphasised.
      const said = document.createElement("span");
      said.className = "level-modal-assist";
      said.textContent = piece.assist;
      words.append(said);
    } else {
      // The one word in the box the accent picks out, and it is picked out
      // because it is the whole of what that sentence is saying.
      const marked = document.createElement("em");
      marked.className = "level-modal-marked";
      marked.textContent = piece.marked;
      words.append(marked);
    }
  }
  row.append(words);

  if (controls.length > 0) {
    const said = document.createElement("div");
    said.className = "level-modal-say";
    said.append(...controls);
    row.append(said);
  }

  return row;
}

/**
 * The heart count in the corner, and the one way it moves.
 *
 * The only number for this fact in the box: the button that gives a heart
 * carries a word instead, so there is nothing here for it to disagree with.
 */
function heartCount(level: TranscriptionSummary): {
  element: HTMLElement;
  move(by: 1 | -1): void;
} {
  let count = level.upvoteCount ?? 0;
  const element = countFigure(heartIcon(), count, heartsSaid(count), "heart");
  const number = element.querySelector(".level-figure-count");
  return {
    element,
    move(by) {
      count += by;
      if (number !== null) number.textContent = String(count);
      element.setAttribute("aria-label", heartsSaid(count));
      element.title = heartsSaid(count);
    },
  };
}

/** The last line: what it has earned and whose it is, then the ways out. */
function foot(
  options: LevelModalOptions,
  plan: ReturnType<typeof levelBoxPlan>,
  hearts: HTMLElement,
  close: () => void,
): HTMLElement {
  const { level, viewer } = options;

  const row = document.createElement("div");
  row.className = "level-modal-foot";

  const said = document.createElement("div");
  said.className = "level-modal-earned";

  const solvers = level.solveCount ?? 0;
  said.append(hearts, countFigure(flagIcon(), solvers, solversSaid(solvers), "flag"));

  const byline = document.createElement("p");
  byline.className = "level-modal-byline";
  if (plan.byline === "own") {
    byline.textContent = "You own this tune!";
    byline.classList.add("is-yours");
  } else {
    // The site's own tunes are the ones worth picking out of a page of names,
    // and they are picked out here the way the cards pick them out.
    const who = bylineOf(level, viewer);
    const name = document.createElement("span");
    name.className =
      who.mark === undefined
        ? "level-byline-name"
        : `level-byline-name is-${who.mark}`;
    name.textContent = who.name;
    byline.append("Transcribed by ", name);
  }
  said.append(byline);

  const buttons = document.createElement("div");
  buttons.className = "modal-buttons";
  for (const button of plan.buttons) {
    buttons.append(wayOut(button, options, close));
  }

  row.append(said, buttons);
  return row;
}

/**
 * One way out of the box.
 *
 * A link where it is an address and a button where it is something done here,
 * which is the distinction the cards draw too — so the catalog's way in can be
 * opened in a new tab and the puzzle's cannot, there being no second page.
 */
function wayOut(
  button: ReturnType<typeof levelBoxPlan>["buttons"][number],
  options: LevelModalOptions,
  close: () => void,
): HTMLElement {
  const look = `${button.accent ? "modal-confirm" : "modal-cancel"} level-modal-way`;

  if (button.act === "play" || button.act === "catalog") {
    const link = document.createElement("a");
    link.className = look;
    link.textContent = button.label;
    link.href =
      button.act === "catalog"
        ? "/tunes"
        : `/play?tune=${encodeURIComponent(options.level.id)}`;
    if (button.act === "play") {
      // The puzzle page opens this box for itself when somebody arrives cold;
      // pressing the way in from here is the opposite of arriving cold.
      link.addEventListener("click", () =>
        markOpened(window.sessionStorage, options.level.id),
      );
    }
    return link;
  }

  const pressed = document.createElement("button");
  pressed.type = "button";
  pressed.className = look;
  pressed.textContent = button.label;
  pressed.addEventListener("click", () => {
    if (button.act === "edit") {
      close();
      options.onEditDetails?.();
      return;
    }
    close();
  });
  return pressed;
}
