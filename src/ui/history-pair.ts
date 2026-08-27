/**
 * Undo and Redo, side by side.
 *
 * They stand in the keyboard band, under Clear pitch: taking a note back is
 * the same kind of act as taking its pitch off, and both are done with the
 * hand that is already down there on the keys. Not in the bar above the score,
 * which is the page's heading — what this is, what key it is in, how long you
 * have been at it — and not in the side panel, which is the video's.
 *
 * A pair rather than a stack: the band is only as tall as the piano in it, and
 * a second row would have to come out of the keys.
 *
 * Built once and mutated, because both grey and ungrey on every edit and a
 * group rebuilt that often would take the focus ring with it. That is also why
 * this has a host of its own beside `#pitch-actions` rather than a place
 * inside it: the editor empties that host and draws it again on every edit,
 * and the melody these two replace outright is the one thing the editor cannot
 * do to itself.
 */

import { chip, REDO_KEY, UNDO_KEY } from "./chip.js";

export type HistoryPairState = {
  canUndo: boolean;
  canRedo: boolean;
};

export type HistoryPairHandlers = {
  onUndo: () => void;
  onRedo: () => void;
};

export type HistoryPair = {
  update(state: HistoryPairState): void;
};

export function createHistoryPair(
  element: HTMLElement,
  handlers: HistoryPairHandlers,
): HistoryPair {
  element.replaceChildren();

  const undo = chip("Undo", UNDO_KEY, handlers.onUndo);
  const redo = chip("Redo", REDO_KEY, handlers.onRedo);

  const history = document.createElement("div");
  history.className = "history";
  history.append(undo, redo);
  element.append(history);

  return {
    update(state) {
      undo.disabled = !state.canUndo;
      redo.disabled = !state.canRedo;
    },
  };
}
