/**
 * The top of the side panel: the line saying how to see the shortcuts, and —
 * in the editor — the switch that says whether the rhythm controls are on the
 * page at all.
 *
 * Two things about the page rather than about the piece, which is why they sit
 * apart from everything else and above it. Undo and redo were here once; they
 * went to the keyboard band with Clear pitch, where the hand already is.
 *
 * A function rather than lines of markup because the note carries the listener
 * that answers K (see `keys-note.ts`) and the switch has state to keep.
 */

import { createKeysNote } from "./keys-note.js";
import { createSwitch } from "./switch.js";

export type SideToolsState = {
  /**
   * Whether the rhythm controls are showing. Absent on the play page, where
   * the rhythm is the level's and there is no switch to draw.
   */
  showRhythm?: boolean;
};

export type SideToolsHandlers = {
  /**
   * Show or hide the rhythm controls. Given only by the editor: playing a
   * level never writes a duration, so the switch would offer nothing.
   */
  onRhythm?: (show: boolean) => void;
};

export type SideTools = {
  update(state: SideToolsState): void;
};

export function createSideTools(
  element: HTMLElement,
  handlers: SideToolsHandlers = {},
): SideTools {
  element.replaceChildren();
  element.append(createKeysNote());

  // On by default, and the default is the whole melody: somebody who opened
  // the editor came to write one down, and the rhythm is half of that. Turning
  // it off is for the pass where only the pitches are left.
  const rhythm =
    handlers.onRhythm === undefined
      ? undefined
      : createSwitch({
          label: "Show Rhythm Editor",
          title: "Show the durations, tuplets and rests above the score",
          checked: true,
          onChange: handlers.onRhythm,
        });
  if (rhythm) element.append(rhythm.element);

  return {
    update(state) {
      if (rhythm && state.showRhythm !== undefined) rhythm.set(state.showRhythm);
    },
  };
}
