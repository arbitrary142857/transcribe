/**
 * The side panel's working controls, in two places on either side of the video.
 *
 * Everything the bar over the score used to hold, less what became part of the
 * sheet itself. The bar is gone: a title, a subtitle and a byline are the head
 * of the page and belong on the page, and once they had moved there what was
 * left in the bar was four controls with nothing to head.
 *
 * Above the video are the two boxes the editor opens, Key and Details, side by
 * side; a puzzle has neither, because the key is on the stave and the words
 * belong to somebody else. Below the video is the row that ends the sitting —
 * Save, or Check, with the clock beside it in a puzzle — as far from the music
 * as a control can be put while staying on the page, which is where a thing
 * you press once at the end belongs.
 *
 * Key and Details open boxes over the page rather than panels hanging off
 * themselves. A disclosure the width of this column would have had nowhere to
 * hang; centred, both are the size they want to be.
 *
 * Built once and mutated, like everything else that survives an edit.
 */

import type { KeySignature } from "../music/key-signature.js";
import { formatElapsed } from "../puzzle/stopwatch.js";
import { attemptsLabel } from "../puzzle/verdicts.js";
import type { TranscriptionDetails } from "../shared/transcription.js";
import { createDetailsFields } from "./details-panel.js";
import { keyLabel } from "./key-label.js";
import { renderKeyPanel } from "./key-panel.js";
import { openInfoModal } from "./modal.js";

export type PanelActionsState = {
  /** What the committing button reads, and whether it can be pressed. */
  submit: { label: string; disabled: boolean };
  /**
   * The one line under the rows: why the button is grey, what the last check
   * found, or what went wrong sending it. Empty for nothing to say.
   */
  message: string;
  /** Editor only: the key the melody is in, for the Key button's face. */
  key?: KeySignature;
  /** Editor only: which clef the key box draws its fifteen signatures on. */
  clef?: string;
  /** Editor only: the words, for the Details button's face and its box. */
  details?: TranscriptionDetails;
  /** Puzzle only: the clock, and how many times the answer has been asked for. */
  clock?: {
    elapsedMs: number;
    checkCount: number;
    solved: boolean;
    /**
     * Whether the clock stopped in front of us, as against having been stopped
     * before the page opened. Only the first is worth a pop: arriving at a
     * level you finished last week is a fact, not an event.
     */
    justSolved: boolean;
  };
};

export type PanelActionsHandlers = {
  onSubmit: () => void;
  /** Editor only. Given together or not at all; a puzzle gives neither. */
  onKey?: (key: KeySignature) => void;
  onDetails?: (details: TranscriptionDetails) => void;
};

export type PanelActions = {
  update(state: PanelActionsState): void;
};

export type PanelActionsElements = {
  /** Above the video: Key and Details, in the editor. */
  boxes: HTMLElement;
  /** Below the video: the clock and the button that ends the sitting. */
  submit: HTMLElement;
};

export function createPanelActions(
  elements: PanelActionsElements,
  handlers: PanelActionsHandlers,
): PanelActions {
  const element = elements.boxes;
  element.replaceChildren();
  elements.submit.replaceChildren();

  /** The last state seen, for the boxes that are filled only on opening. */
  let shown: PanelActionsState | undefined;

  // ---- under the video: what ends the sitting, and what timed it -----------

  const top = document.createElement("div");
  top.className = "panel-row";

  let clock: HTMLElement | undefined;
  let clockValue: HTMLElement | undefined;
  let checks: HTMLElement | undefined;

  if (!handlers.onKey) {
    // The clock and the attempt count, in one box. A box rather than loose
    // text because it is the only thing on the page that changes while you are
    // not touching anything, and as plain type it read as furniture. Tinted
    // while the puzzle runs and green when it stops — which is how the page
    // says the clock has paused, now that no banner says it.
    clock = document.createElement("div");
    clock.className = "play-clock panel-cell";

    // Named, like Key and Details and the section's own two fields. It is also
    // what makes this half of the row the wider one, which it should be: the
    // button beside it holds one short word.
    const clockName = document.createElement("span");
    clockName.className = "play-clock-label";
    clockName.textContent = "Timer";
    clock.append(clockName);

    clockValue = document.createElement("span");
    clockValue.className = "play-clock-value";
    // Not read out every second. It settles once, and that is worth announcing.
    clockValue.setAttribute("aria-live", "off");

    checks = document.createElement("span");
    checks.className = "play-checks";

    clock.append(clockValue, checks);
    top.append(clock);
  }

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "submit-button";
  submit.addEventListener("click", handlers.onSubmit);

  /**
   * Why the button is grey, what the last check found, or what went wrong
   * sending it — shown only when the button is pointed at.
   *
   * These are grey for most of a sitting: a title has not been typed, notes are
   * still blank. As a standing line it was a sentence the panel always carried
   * and nobody needed twice, and it moved everything under it whenever it
   * changed. Out of the flow it cannot do either.
   *
   * The hover lives on this wrapper rather than on the button because a
   * disabled button takes no pointer events at all and so can never be hovered
   * — which is exactly when there is something to say. The note stays rendered
   * rather than removed, for the same reason: a keyboard user cannot focus a
   * disabled button either, so the button points at this with
   * `aria-describedby` and it has to be there to be pointed at.
   */
  const message = document.createElement("p");
  message.className = "panel-note";
  message.id = "panel-note";
  message.setAttribute("role", "status");
  submit.setAttribute("aria-describedby", message.id);

  const hold = document.createElement("div");
  hold.className = "submit-hold panel-cell";
  hold.append(submit, message);
  top.append(hold);

  elements.submit.append(top);

  // ---- the second row: the two boxes, in the editor only -----------------

  let keyValue: HTMLElement | undefined;
  let detailsValue: HTMLElement | undefined;

  if (handlers.onKey && handlers.onDetails) {
    const onKey = handlers.onKey;
    const onDetails = handlers.onDetails;

    const boxes = document.createElement("div");
    boxes.className = "panel-row";

    const keyButton = document.createElement("button");
    keyButton.type = "button";
    keyButton.className = "key-toggle panel-cell";
    const keyName = document.createElement("span");
    keyName.className = "key-toggle-label";
    keyName.textContent = "Key";
    keyValue = document.createElement("span");
    keyValue.className = "key-toggle-value";
    keyButton.append(keyName, keyValue);
    keyButton.addEventListener("click", openKeyBox);

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "key-toggle panel-cell";
    const detailsName = document.createElement("span");
    detailsName.className = "key-toggle-label";
    detailsName.textContent = "Details";
    detailsValue = document.createElement("span");
    detailsValue.className = "key-toggle-value details-title";
    detailsButton.append(detailsName, detailsValue);
    detailsButton.addEventListener("click", openDetailsBox);

    boxes.append(keyButton, detailsButton);
    element.append(boxes);

    /**
     * Fifteen staves, drawn on opening rather than up front — most sittings
     * never change key at all — and drawn again on every pick, because the box
     * stays open and the ring has to move to the key just chosen.
     *
     * Staying open is deliberate: keys are tried one against another, and a
     * box that dismissed itself made every comparison two clicks longer.
     */
    function openKeyBox(): void {
      openInfoModal({
        className: "key-modal",
        fill() {
          const heading = document.createElement("h2");
          heading.className = "modal-title";
          heading.textContent = "Choose a key signature";

          const panel = document.createElement("div");
          panel.className = "key-panel key-modal-panel";
          const draw = (): void => {
            if (!shown?.key) return;
            renderKeyPanel(panel, {
              clef: shown.clef ?? "treble",
              current: shown.key,
              onPick: (picked) => {
                // Takes effect synchronously — the page rebuilds and hands the
                // new state back through update() — so this redraw sees it.
                onKey(picked);
                draw();
              },
            });
          };
          draw();
          return [heading, panel];
        },
      });
    }

    /**
     * The words, in a box with no OK: every keystroke has already been
     * reported by the time it closes, so there is nothing left to agree to.
     * Fields made fresh each opening, for the same reason.
     */
    function openDetailsBox(): void {
      openInfoModal({
        className: "details-modal panel-details-modal",
        fill() {
          const heading = document.createElement("h2");
          heading.className = "modal-title";
          heading.textContent = "Name your transcription";

          const fields = createDetailsFields(onDetails);
          if (shown?.details) fields.update(shown.details);
          return [heading, ...fields.rows];
        },
      });
    }
  }

  return {
    update(state) {
      shown = state;

      submit.textContent = state.submit.label;
      submit.disabled = state.submit.disabled;
      // Emptied rather than hidden: it is out of the flow, so it costs nothing
      // standing there, and `:empty` is what keeps the pill from appearing as
      // a small dark rectangle saying nothing.
      message.textContent = state.message;

      if (clock && clockValue && checks && state.clock) {
        clockValue.textContent = formatElapsed(state.clock.elapsedMs);
        checks.textContent =
          attemptsLabel(state.clock.checkCount, state.clock.solved) ?? "";
        // Added once, on the change, rather than on every redraw — which is
        // twice a second while the clock runs. The green is for any solved
        // level; the pop is only for one solved just now.
        if (state.clock.solved && !clock.classList.contains("is-solved")) {
          clock.classList.add("is-solved");
          if (state.clock.justSolved) {
            clock.classList.add("is-stopping");
            clock.addEventListener(
              "animationend",
              () => clock?.classList.remove("is-stopping"),
              { once: true },
            );
          }
        }
      }

      if (keyValue && state.key) keyValue.textContent = keyLabel(state.key);
      if (detailsValue && state.details) {
        const named = state.details.title.trim();
        detailsValue.textContent = named === "" ? "Untitled" : named;
        detailsValue.classList.toggle("is-untitled", named === "");
      }
    },
  };
}
