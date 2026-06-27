import { Duration, NoteValue } from "../music/duration.js";
import { Tuplet } from "../music/tuplet.js";
import type { Room } from "../editor/operations.js";
import { noteIcon } from "./icons.js";

/**
 * The note values the grid offers, longest first.
 *
 * Five values and one dot cover what melodies are actually written in.
 * Thirty-seconds and double dots are left out rather than hidden behind a
 * disclosure: a control nobody opens is worse than one that is not there.
 */
const VALUES = [
  { value: NoteValue.Whole, name: "whole" },
  { value: NoteValue.Half, name: "half" },
  { value: NoteValue.Quarter, name: "quarter" },
  { value: NoteValue.Eighth, name: "eighth" },
  { value: NoteValue.Sixteenth, name: "sixteenth" },
] as const;

const DOT_ROWS = [0, 1];
const DOT_NAMES = ["", "dotted "];

/**
 * The key that writes each plain value, longest to shortest.
 *
 * Only the undotted row gets one. Digits run out, and the pairings left over
 * for the dotted values — a second row of digits, or shifted ones that type
 * punctuation — would be worse than reaching for the button.
 */
const KEYS = ["1", "2", "3", "4", "5"] as const;

const nameOf = (value: number, dots: number) =>
  `${DOT_NAMES[dots] ?? ""}${VALUES.find((v) => v.value === value)?.name ?? ""} note`;

export type DurationGridOptions = {
  /** Write this duration at the selection. */
  onPick: (duration: Duration) => void;
  /**
   * Say why a control is unavailable, or clear the message with `undefined`.
   * Called on hover, so a greyed cell can explain itself rather than just
   * refusing.
   */
  onExplain: (reason: string | undefined) => void;
};

export type DurationGrid = {
  /** Write the duration a shortcut names, if that cell is available. */
  press(key: string): boolean;
  /**
   * Grey the cells that will not fit; `undefined` greys them all.
   *
   * Inside a tuplet bracket every member shares the bracket's ratio, so the
   * cells stand for durations carrying it — a "quarter" in a triplet is a
   * triplet quarter. Offering plain durations there would write an event whose
   * ratio disagreed with the bracket around it.
   */
  update(room: Room | undefined, ratio?: Tuplet): void;
};

const BOUNDARY: Record<Room["limitedBy"], string> = {
  "next-note": "before the next note",
  barline: "before the barline",
  bracket: "inside the tuplet",
};

const reasonFor = (room: Room, value: number, dots: number): string =>
  `A ${nameOf(value, dots)} will not fit ${BOUNDARY[room.limitedBy]}`;

/**
 * Build the duration controls.
 *
 * Every cell is one complete `Duration`, so a single click is always a finished
 * duration. That is what lets the selection move on afterwards without ever
 * cutting an edit short: there is no second click pending, no armed value and no
 * sticky modifier, so nothing is ever lit in a way that changes what the next
 * click means.
 */
export function createDurationGrid(
  element: HTMLElement,
  { onPick, onExplain }: DurationGridOptions,
): DurationGrid {
  element.replaceChildren();

  const panel = document.createElement("div");
  panel.className = "panel rhythm-panel";

  const grid = document.createElement("div");
  grid.className = "duration-grid";

  const cells: {
    button: HTMLButtonElement;
    value: number;
    dots: number;
    key?: string;
  }[] = [];
  let ratio: Tuplet = Tuplet.None;
  const durationOf = (value: number, dots: number) =>
    new Duration(value as never, dots, ratio);

  for (const dots of DOT_ROWS) {
    VALUES.forEach(({ value }, column) => {
      const key = dots === 0 ? KEYS[column] : undefined;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "duration-cell";
      button.dataset.value = String(value);
      button.dataset.dots = String(dots);
      button.innerHTML =
        (key ? `<kbd class="cell-key">${key}</kbd>` : "") +
        noteIcon(value, dots);
      button.title = key
        ? `${nameOf(value, dots)} (${key})`
        : nameOf(value, dots);
      button.setAttribute("aria-label", nameOf(value, dots));
      button.addEventListener("click", () => onPick(durationOf(value, dots)));

      cells.push({ button, value, dots, key });
      grid.append(button);
    });
  }

  panel.append(grid);
  element.append(panel);

  let currentRoom: Room | undefined;

  // Hover is read on the grid rather than each button: a disabled button emits
  // no pointer events of its own, and the reason is exactly what a user needs
  // when the thing they aimed at will not respond.
  grid.addEventListener("mousemove", (event) => {
    const target = (event.target as HTMLElement).closest(".duration-cell");
    const cell = cells.find(({ button }) => button === target);
    if (!cell || !currentRoom || !cell.button.disabled) {
      onExplain(undefined);
      return;
    }
    onExplain(reasonFor(currentRoom, cell.value, cell.dots));
  });
  grid.addEventListener("mouseleave", () => onExplain(undefined));

  return {
    press(key) {
      const cell = cells.find((candidate) => candidate.key === key);
      if (!cell || cell.button.disabled) {
        return false;
      }
      onPick(durationOf(cell.value, cell.dots));
      return true;
    },

    update(room, inBracket = Tuplet.None) {
      currentRoom = room;
      ratio = inBracket;
      for (const { button, value, dots } of cells) {
        button.disabled =
          !room ||
          durationOf(value, dots)
            .asWholeNoteFraction()
            .compare(room.available) > 0;
      }
    },
  };
}
