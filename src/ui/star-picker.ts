/**
 * How the author says how hard it is.
 *
 * Five stars, each in two halves: the left half of the third star is two and
 * a half, the right half is three. The arrow keys move by a half. Pressing
 * the value already chosen clears it, because "unrated" is a thing an author
 * may mean and there is no other way to say it. The number is printed beside
 * the stars, so a half is never a guess.
 *
 * The stars are `difficulty.ts`'s, so the picker and the card cannot disagree
 * about what a half-star looks like; the range and the step are
 * `shared/difficulty.ts`'s, so changing either is changing one file.
 */

import { DIFFICULTY, isStars, starsOfHalf } from "../shared/difficulty.js";
import { starGlyphs } from "./difficulty.js";

export type StarPicker = {
  readonly element: HTMLElement;
  /** Draw a value as chosen, without telling anybody. */
  set(value: number | undefined): void;
};

export function createStarPicker(options: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}): StarPicker {
  const element = document.createElement("div");
  element.className = "star-picker";

  const row = document.createElement("div");
  row.className = "star-picker-stars";
  row.setAttribute("role", "radiogroup");
  row.setAttribute("aria-label", "Difficulty");

  const text = document.createElement("span");
  text.className = "star-picker-text";

  let chosen = options.value;

  /** The ten halves, each a button over one half of a star. */
  const halves: HTMLButtonElement[] = [];
  for (let half = DIFFICULTY.halfMin; half <= DIFFICULTY.halfMax; half++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `star-pick ${half % 2 === 1 ? "is-left" : "is-right"}`;
    button.setAttribute("role", "radio");
    const stars = starsOfHalf(half);
    button.setAttribute("aria-label", `${stars} of ${DIFFICULTY.stars} stars`);
    button.addEventListener("click", () => choose(stars === chosen ? undefined : stars));
    button.addEventListener("keydown", (event) => {
      const step =
        event.key === "ArrowRight" || event.key === "ArrowUp"
          ? 0.5
          : event.key === "ArrowLeft" || event.key === "ArrowDown"
            ? -0.5
            : undefined;
      if (step === undefined) return;
      event.preventDefault();
      const next = (chosen ?? 0) + step;
      choose(isStars(next) ? next : next <= 0 ? undefined : chosen);
    });
    halves.push(button);
  }

  const drawn = document.createElement("div");
  drawn.className = "star-picker-drawn";
  drawn.setAttribute("aria-hidden", "true");

  row.append(drawn, ...halves);
  element.append(row, text);

  function draw(): void {
    drawn.replaceChildren(...starGlyphs(chosen ?? 0));
    for (const [at, button] of halves.entries()) {
      const stars = starsOfHalf(at + DIFFICULTY.halfMin);
      const on = stars === chosen;
      button.setAttribute("aria-checked", String(on));
      // One stop in the tab order: the chosen half, or the first when none.
      button.tabIndex = on || (chosen === undefined && at === 0) ? 0 : -1;
    }
    text.textContent = chosen === undefined ? "Not rated" : `${chosen} of ${DIFFICULTY.stars}`;
  }

  function choose(value: number | undefined): void {
    chosen = value;
    draw();
    // Keep the focus on the half that is now chosen, so the arrows keep working.
    const focused = halves.find((button) => button.tabIndex === 0);
    if (document.activeElement !== null && row.contains(document.activeElement)) {
      focused?.focus();
    }
    options.onChange(chosen);
  }

  draw();
  return {
    element,
    set(value) {
      chosen = value;
      draw();
    },
  };
}
