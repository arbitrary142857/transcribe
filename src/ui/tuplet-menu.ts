import type { Melody } from "../music/melody.js";
import { Tuplet } from "../music/tuplet.js";
import { ratiosOfferedAt } from "../editor/operations.js";
import { tupletIcon } from "./icons.js";

/**
 * The ratios the menu shows.
 *
 * The four that divide a beat into more parts sit together in a square; the
 * duplet is set apart because it is the one that divides into fewer, which is
 * a different thing to reach for.
 */
const RATIOS: readonly { tuplet: Tuplet; name: string; aside?: boolean }[] = [
  { tuplet: Tuplet.Triplet, name: "Triplet" },
  { tuplet: Tuplet.Quintuplet, name: "Quintuplet" },
  { tuplet: new Tuplet(6, 4), name: "Sextuplet" },
  { tuplet: new Tuplet(7, 4), name: "Septuplet" },
  { tuplet: new Tuplet(2, 3), name: "Duplet", aside: true },
];

export type TupletMenuOptions = {
  /** Divide the selection by this ratio. */
  onDivide: (tuplet: Tuplet) => void;
  /** Undo the division the selection is inside. */
  onUndivide: () => void;
};

export type TupletMenu = {
  /** Offer the ratios that fit, and light the one the selection is inside. */
  update(melody: Melody, index: number | undefined): void;
};

/**
 * Build the tuplet controls.
 *
 * Each ratio is a toggle: it divides the selection, and pressing the lit one
 * puts it back. Making the inverse the same control is what keeps undoing a
 * division from being a separate, destructive command.
 */
export function createTupletMenu(
  element: HTMLElement,
  { onDivide, onUndivide }: TupletMenuOptions,
): TupletMenu {
  element.replaceChildren();

  const panel = document.createElement("div");
  panel.className = "panel tuplet-panel";
  const grid = document.createElement("div");
  grid.className = "tuplet-grid";
  const aside = document.createElement("div");
  aside.className = "tuplet-aside";
  panel.append(grid, aside);
  element.append(panel);

  const buttons = RATIOS.map(({ tuplet, name, aside: apart }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tuplet";
    // The bracket is what will actually appear over the notes, which says more
    // than a bare number did and needs no caption to be read.
    button.innerHTML = tupletIcon(tuplet.numNotes);
    button.title = `${name} — ${tuplet.numNotes} in the time of ${tuplet.inTimeOf}`;
    button.setAttribute("aria-label", `${name}, ${tuplet}`);
    button.setAttribute("aria-pressed", "false");
    (apart ? aside : grid).append(button);
    return { button, tuplet };
  });

  for (const { button, tuplet } of buttons) {
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-pressed") === "true") {
        onUndivide();
      } else {
        onDivide(tuplet);
      }
    });
  }

  return {
    update(melody, index) {
      const inside =
        index === undefined ? undefined : melody.getTupletSpan(index).tuplet;
      const offered =
        index === undefined ? [] : ratiosOfferedAt(melody, index);

      for (const { button, tuplet } of buttons) {
        const lit = inside !== undefined && inside.isEqual(tuplet);
        button.setAttribute("aria-pressed", String(lit));
        button.classList.toggle("is-on", lit);
        // A lit ratio stays live so it can be pressed again to undo itself.
        button.disabled =
          !lit && !offered.some((candidate) => candidate.isEqual(tuplet));
      }
    },
  };
}
