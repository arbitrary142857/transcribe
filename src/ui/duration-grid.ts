import { Duration, NoteValue } from "../music/duration.js";
import { Tuplet } from "../music/tuplet.js";
import type { Room } from "../editor/operations.js";
import { noteIcon } from "./icons.js";

/**
 * The note values the grid offers, longest first.
 *
 * Every value the music model can write, down to the thirty-second, each with
 * and without a dot. Double dots are the one thing left out, and left out rather
 * than hidden behind a disclosure: a control nobody opens is worse than one that
 * is not there, and a double dot is rare enough in a melody to be written as a
 * tie instead.
 */
const VALUES = [
  { value: NoteValue.Whole, name: "whole" },
  { value: NoteValue.Half, name: "half" },
  { value: NoteValue.Quarter, name: "quarter" },
  { value: NoteValue.Eighth, name: "eighth" },
  { value: NoteValue.Sixteenth, name: "sixteenth" },
  { value: NoteValue.ThirtySecond, name: "thirty-second" },
] as const;

const DOT_ROWS = [0, 1];
const DOT_NAMES = ["", "dotted "];

/**
 * The digit that writes each value, longest to shortest.
 *
 * The same digit serves both rows: plain writes the plain value, and with
 * Shift held it writes the dotted one. The editor matches on the physical
 * key, not the typed character — Shift+1 types "!" on most layouts, and the
 * shortcut must not care.
 */
const KEYS = ["1", "2", "3", "4", "5", "6"] as const;

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
  /** Write the duration a digit names — the dotted one with `dotted` — if that cell is available. */
  press(key: string, dotted: boolean): boolean;
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

/**
 * What is in the way, which is the whole of what a greyed cell has to say.
 *
 * The length is not named: the cell under the pointer is a picture of it, and
 * repeating "a dotted sixteenth note" ran the answer onto a second line for
 * something already in view.
 */
const BOUNDARY: Record<Room["limitedBy"], string> = {
  "next-note": "No room before the next note",
  barline: "No room before the barline",
  bracket: "No room inside the tuplet",
};

const reasonFor = (room: Room): string => BOUNDARY[room.limitedBy];

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
    /** Whether this length will not fit where the selection is. */
    unavailable: boolean;
  }[] = [];
  let ratio: Tuplet = Tuplet.None;
  const durationOf = (value: number, dots: number) =>
    new Duration(value as never, dots, ratio);

  for (const dots of DOT_ROWS) {
    VALUES.forEach(({ value }, column) => {
      const key = KEYS[column];
      const printed = dots === 0 ? key : `⇧${key}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "duration-cell";
      button.dataset.value = String(value);
      button.dataset.dots = String(dots);
      button.innerHTML =
        `<kbd class="cell-key">${printed}</kbd>` + noteIcon(value, dots);
      button.setAttribute("aria-label", nameOf(value, dots));

      const cell = { button, value, dots, key, unavailable: true };
      button.addEventListener("click", () => {
        // Refused here rather than by the button being `disabled`. A disabled
        // button is inert to the pointer as well as to the press, and being
        // pointed at is how a greyed cell says why it is grey — see the hover
        // listener below.
        if (cell.unavailable) {
          onExplain(explain());
          return;
        }
        onPick(durationOf(value, dots));
      });

      cells.push(cell);
      grid.append(button);
    });
  }

  panel.append(grid);
  element.append(panel);

  let currentRoom: Room | undefined;

  const explain = () => (currentRoom ? reasonFor(currentRoom) : undefined);

  // Hover is read on the grid, and the cells stay live to the pointer for it to
  // work at all.
  //
  // The reason a greyed cell will not take a press is exactly what somebody
  // aiming at it needs, and there is nowhere else to put it. A `disabled`
  // button, though, fires no mouse events *and they do not bubble*, so over one
  // of those this listener never ran: the explanation this grid was built to
  // give has never once appeared. Hence `aria-disabled` and a class rather than
  // the real attribute, with the press refused in the handler above.
  grid.addEventListener("mousemove", (event) => {
    const target = (event.target as HTMLElement).closest(".duration-cell");
    const cell = cells.find(({ button }) => button === target);
    onExplain(cell?.unavailable ? explain() : undefined);
  });
  grid.addEventListener("mouseleave", () => onExplain(undefined));

  return {
    press(key, dotted) {
      const cell = cells.find(
        (candidate) =>
          candidate.key === key && candidate.dots === (dotted ? 1 : 0),
      );
      if (!cell || cell.unavailable) {
        return false;
      }
      onPick(durationOf(cell.value, cell.dots));
      return true;
    },

    update(room, inBracket = Tuplet.None) {
      currentRoom = room;
      ratio = inBracket;
      for (const cell of cells) {
        cell.unavailable =
          !room ||
          durationOf(cell.value, cell.dots)
            .asWholeNoteFraction()
            .compare(room.available) > 0;
        cell.button.classList.toggle("is-unavailable", cell.unavailable);
        // Said as well as drawn. `aria-disabled` rather than `disabled`, so the
        // cell is still announced and still reachable — it has something to say
        // for itself, which is the whole point of it being greyed rather than
        // gone.
        cell.button.setAttribute("aria-disabled", String(cell.unavailable));
      }
    },
  };
}
