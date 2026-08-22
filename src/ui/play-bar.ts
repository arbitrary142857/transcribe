/**
 * The bar above a puzzle: what it is, how long you have been at it, and the
 * one button that asks whether you are right.
 *
 * Deliberately not the editor's bar with parts switched off. Three of that
 * bar's four controls — the key chooser, the details boxes, the melody/pitches
 * switch — are exactly what playing a level takes away, so sharing it would
 * mean a component that is mostly branches. What the two genuinely share has
 * been moved out instead: the key wording, the chips, and the CSS.
 *
 * The key is a readout rather than a button, and it has to be there: a stave
 * showing no accidentals is A minor as readily as C major, so the signature
 * alone does not say what you are transcribing into.
 *
 * Built once and mutated, never rebuilt. The timer changes every second, and a
 * bar rebuilt that often would take the focus ring with it each time.
 */

import type { KeySignature } from "../music/key-signature.js";
import { formatElapsed } from "../puzzle/stopwatch.js";
import { authorLabel } from "../shared/session.js";
import { attemptsLabel } from "../puzzle/verdicts.js";
import { chip, REDO_KEY, UNDO_KEY } from "./chip.js";
import { keyLabel } from "./key-label.js";

export type PlayBarState = {
  title: string;
  subtitle: string | undefined;
  /** The author's name as shown, or nothing for Anonymous; see `authorLabel`. */
  author: string | undefined;
  key: KeySignature;
  canUndo: boolean;
  canRedo: boolean;
  elapsedMs: number;
  /** How many times the answer has been asked for. Shown beside the clock. */
  checkCount: number;
  /** Why Check cannot be pressed, or nothing if it can. */
  checkProblem: string | undefined;
  /** True while the request is out, so a second press cannot make a second one. */
  checking: boolean;
  /** What the last check said, or what went wrong asking. */
  report: string | undefined;
  solved: boolean;
};

export type PlayBarHandlers = {
  onUndo: () => void;
  onRedo: () => void;
  onCheck: () => void;
  /** Open the level's own box: the facts, and what the author wrote. */
  onAbout: () => void;
};

export type PlayBar = {
  update(state: PlayBarState): void;
};

export function createPlayBar(
  element: HTMLElement,
  handlers: PlayBarHandlers,
): PlayBar {
  element.replaceChildren();

  // ---- what it is ------------------------------------------------------

  const naming = document.createElement("div");
  naming.className = "play-naming";

  const title = document.createElement("h1");
  title.className = "play-title";

  const titleText = document.createElement("span");

  // The whole of the "you finished it" mark on the title. Kept out of the text
  // node so a level actually called "Rising ✓" cannot fake one.
  const solvedMark = document.createElement("span");
  solvedMark.className = "play-solved-mark";
  solvedMark.textContent = "✓";
  solvedMark.title = "Solved";
  solvedMark.hidden = true;

  // What the author wanted known, which is easy to want again halfway through.
  const info = document.createElement("button");
  info.type = "button";
  info.className = "play-info";
  info.textContent = "i";
  info.title = "About";
  info.setAttribute("aria-label", "About");
  info.addEventListener("click", handlers.onAbout);

  title.append(titleText, solvedMark, info);

  const subtitle = document.createElement("p");
  subtitle.className = "play-subtitle";

  naming.append(title, subtitle);

  // ---- the key, read and not chosen -------------------------------------

  const key = document.createElement("p");
  key.className = "play-key";

  const keyName = document.createElement("span");
  keyName.className = "play-key-label";
  keyName.textContent = "Key";
  const keyValue = document.createElement("span");
  keyValue.className = "play-key-value";
  key.append(keyName, keyValue);

  // ---- the clock --------------------------------------------------------

  /**
   * The clock and the attempt count, in one box.
   *
   * A box rather than loose text because it is the only thing on the page that
   * changes while you are not touching anything, and as plain type it read as
   * part of the furniture. It is tinted while the puzzle is running and turns
   * green when it stops — which is how the page says the clock has paused, now
   * that there is no banner to say it.
   */
  const clock = document.createElement("div");
  clock.className = "play-clock";

  const clockValue = document.createElement("span");
  clockValue.className = "play-clock-value";
  // Not read out every second. It settles once, and that is worth announcing.
  clockValue.setAttribute("aria-live", "off");

  const checks = document.createElement("span");
  checks.className = "play-checks";

  clock.append(clockValue, checks);

  // ---- history and the way out ------------------------------------------

  const undo = chip("Undo", UNDO_KEY, handlers.onUndo);
  const redo = chip("Redo", REDO_KEY, handlers.onRedo);

  const history = document.createElement("div");
  history.className = "history";
  history.append(undo, redo);

  const check = document.createElement("button");
  check.type = "button";
  check.className = "submit-button";
  check.addEventListener("click", handlers.onCheck);

  // Says why it is grey, and what the last check found — but only when pointed
  // at. See the same note in signature-bar.ts for why it hangs out of the flow
  // and why the button describes itself by it.
  const checkNote = document.createElement("p");
  checkNote.className = "submit-note";
  checkNote.id = "check-note";
  checkNote.setAttribute("role", "status");
  check.setAttribute("aria-describedby", checkNote.id);

  const checkGroup = document.createElement("div");
  checkGroup.className = "submit-group";
  checkGroup.append(check, checkNote);

  element.append(naming, key, clock, history, checkGroup);

  return {
    update(state) {
      titleText.textContent = state.title;
      solvedMark.hidden = !state.solved;
      // "Laufey · by jason", or the byline alone: every level says somebody.
      subtitle.textContent = [state.subtitle, authorLabel(state.author)]
        .filter((part) => part !== undefined)
        .join(" · ");

      keyValue.textContent = keyLabel(state.key);

      clockValue.textContent = formatElapsed(state.elapsedMs);
      checks.textContent = attemptsLabel(state.checkCount, state.solved) ?? "";
      // The pop is added once, on the change, rather than every time the state
      // is redrawn — which is twice a second while the clock runs.
      if (state.solved && !clock.classList.contains("is-solved")) {
        clock.classList.add("is-solved", "is-stopping");
        clock.addEventListener(
          "animationend",
          () => clock.classList.remove("is-stopping"),
          { once: true },
        );
      }

      undo.disabled = !state.canUndo;
      redo.disabled = !state.canRedo;

      check.textContent = state.checking
        ? "Checking…"
        : state.solved
          ? "Solved"
          : "Check";
      check.disabled =
        state.checking || state.solved || state.checkProblem !== undefined;
      // What the last check said wins over why the next one cannot be made:
      // "two notes are wrong" is the more useful of the two, and the reason
      // the button is grey is that you are still fixing them.
      checkNote.textContent = state.checking
        ? ""
        : (state.report ?? state.checkProblem ?? "");
    },
  };
}
