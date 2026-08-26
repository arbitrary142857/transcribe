/**
 * How anybody says how hard it is: a minus, five peppers, a plus.
 *
 * One press moves the figure by half a pepper, clamped to the scale's ends.
 * The peppers are the whole reading — no number beside them, by decision,
 * and not only for looks: printed text between the peppers and the plus
 * changed width as the figure changed, and a button that walks away from
 * the pointer mid-press is worse than no number. The figure in words lives
 * in the spinbutton's accessible value alone. There is no way to clear it,
 * on purpose: a published level must have a difficulty, so the author's
 * control has nothing to say "none" with, and a solver who has second
 * thoughts changes the figure rather than unsaying it.
 *
 * Given no value it shows the middle of the scale, marked provisional (the
 * caller styles it quiet) and reported to nobody: nothing is a rating until
 * a button is pressed. The first press steps *from* the shown middle, so
 * what the eye saw is what the press adjusts.
 *
 * The peppers are `difficulty.ts`'s, so the stepper and the card cannot
 * disagree about what a half looks like; the range and the step are
 * `shared/difficulty.ts`'s. The keyboard works on the figure itself, spinner
 * fashion: arrows step, Home and End go to the ends.
 */

import { DIFFICULTY, isStars, starsOfHalf } from "../shared/difficulty.js";
import { pepperGlyphs } from "./difficulty.js";

/**
 * What the scale starts at before anybody has spoken. The true middle of
 * 0.5–5 is 2.75, which is not a thing the scale can say; 2.5 is the half
 * below it, and the value 0006 gave every level published before the rule.
 */
const MIDDLE = 2.5;

export type DifficultyStepper = {
  readonly element: HTMLElement;
  /** Draw a value as chosen, without telling anybody; none is provisional. */
  set(value: number | undefined): void;
};

export function createDifficultyStepper(options: {
  value: number | undefined;
  onChange: (value: number) => void;
}): DifficultyStepper {
  const element = document.createElement("div");
  element.className = "difficulty-stepper";

  let chosen = options.value;

  const button = (
    move: -0.5 | 0.5,
    label: string,
    mark: string,
  ): HTMLButtonElement => {
    const pressed = document.createElement("button");
    pressed.type = "button";
    pressed.className = "stepper-button";
    pressed.setAttribute("aria-label", label);
    pressed.textContent = mark;
    pressed.addEventListener("click", () => choose((chosen ?? MIDDLE) + move));
    return pressed;
  };

  const down = button(-0.5, "Half a pepper easier", "−");
  const up = button(0.5, "Half a pepper harder", "+");

  const figure = document.createElement("span");
  figure.className = "stepper-figure";
  figure.setAttribute("role", "spinbutton");
  figure.setAttribute("aria-label", "Difficulty");
  figure.setAttribute("aria-valuemin", String(starsOfHalf(DIFFICULTY.halfMin)));
  figure.setAttribute("aria-valuemax", String(starsOfHalf(DIFFICULTY.halfMax)));
  figure.tabIndex = 0;
  figure.addEventListener("keydown", (event) => {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? (chosen ?? MIDDLE) + 0.5
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? (chosen ?? MIDDLE) - 0.5
          : event.key === "Home"
            ? starsOfHalf(DIFFICULTY.halfMin)
            : event.key === "End"
              ? starsOfHalf(DIFFICULTY.halfMax)
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    choose(next);
  });

  const drawn = document.createElement("span");
  drawn.className = "stepper-peppers";
  drawn.setAttribute("aria-hidden", "true");

  figure.append(drawn);
  element.append(down, figure, up);

  function draw(): void {
    const shown = chosen ?? MIDDLE;
    drawn.replaceChildren(...pepperGlyphs(shown));
    figure.setAttribute("aria-valuenow", String(shown));
    figure.setAttribute(
      "aria-valuetext",
      chosen === undefined
        ? `Not rated yet; ${shown} of ${DIFFICULTY.stars} peppers to start from`
        : `${shown} of ${DIFFICULTY.stars} peppers`,
    );
    element.classList.toggle("is-provisional", chosen === undefined);
    down.disabled = shown <= starsOfHalf(DIFFICULTY.halfMin);
    up.disabled = shown >= starsOfHalf(DIFFICULTY.halfMax);
  }

  function choose(value: number): void {
    if (!isStars(value)) return;
    chosen = value;
    draw();
    options.onChange(value);
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
