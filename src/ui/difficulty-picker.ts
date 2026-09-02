/**
 * How anybody says how hard it is: five peppers, pressed where you mean, and
 * an × beside them where saying nothing is allowed.
 *
 * It was a minus, five peppers and a plus, and the row itself was deliberately
 * dead — pressing peppers was rejected then because a row that fills as you
 * cross it is the whole of what makes pressing one legible, and there was no
 * such preview. There is now.
 *
 * The preview is drawn at full strength, not faded. A row of half-transparent
 * peppers reads as a figure that is somehow *less* set rather than as one being
 * chosen; what says "you are choosing" is the row lifting under the pointer — a
 * soft ground behind it and a pointer cursor — while the peppers themselves
 * show, plainly, the figure a press would give. Leaving the row puts the
 * standing figure back.
 *
 * Pressing the figure that already stands does nothing at all. It used to take
 * the proposal back, which made the commonest gesture on the row — pressing
 * what you already meant — quietly destructive. Taking it back is the ×, a
 * different control because it does a different thing.
 *
 * `clearable` is false in exactly one place: the details box of a *published*
 * tune, which must keep a difficulty. The rule itself is `detailsProblem`'s;
 * this only declines to offer the button that would break it.
 *
 * Nothing here sends anything. The caller is told the new figure and decides
 * whether that reaches the database now (the tune's box, where a press is the
 * whole gesture, as the heart is) or when Save Changes is pressed (the details
 * box, where it is one field among four).
 *
 * The peppers are `difficulty.ts`'s, so this and a card cannot disagree about
 * what a half looks like; the range and the step are `shared/difficulty.ts`'s.
 */

import { DIFFICULTY, isStars, starsOfHalf } from "../shared/difficulty.js";
import { pepperGlyphs } from "./difficulty.js";
import { closeIcon } from "./icons.js";

/**
 * What the scale starts from when an arrow key is pressed and nothing has been
 * said. The true middle of 0.5–5 is 2.75, which is not a thing the scale can
 * say; 2.5 is the half below it, and the value 0006 gave every tune published
 * before the rule.
 */
const MIDDLE = 2.5;

const LEAST = starsOfHalf(DIFFICULTY.halfMin);
const MOST = starsOfHalf(DIFFICULTY.halfMax);

const clamp = (stars: number): number => Math.min(MOST, Math.max(LEAST, stars));

/**
 * The rating the pointer is over, as a fraction of the way across the row.
 *
 * Ten stops across five peppers, so each pepper's left half is the half below
 * it: a quarter of the way along the third pepper is 2.5, and its right edge
 * is 3. `ceil` rather than `round` is what makes the whole of a pepper's left
 * half mean the same thing, which is what the eye expects from a row that
 * fills left to right.
 */
export function starsAtFraction(fraction: number): number {
  return clamp(Math.ceil(fraction * DIFFICULTY.halfMax) / 2);
}

/** Half a pepper either way, from the middle when nothing has been said. */
export function stepRating(
  standing: number | undefined,
  move: -0.5 | 0.5,
): number {
  return clamp((standing ?? MIDDLE) + move);
}

export type DifficultyPicker = {
  readonly element: HTMLElement;
  /** Draw a value as chosen, without telling anybody; nothing draws it empty. */
  set(value: number | undefined): void;
};

export function createDifficultyPicker(options: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** What the control is called, where the words beside it do not say. */
  label?: string;
  /**
   * Whether saying nothing is allowed here, and so whether the × is drawn.
   * Everywhere but a published tune's details box, it is.
   */
  clearable?: boolean;
}): DifficultyPicker {
  const name = options.label ?? "Difficulty";
  const clearable = options.clearable !== false;

  const element = document.createElement("div");
  element.className = "difficulty-picker";

  // The peppers are the spinbutton, not the row around them: the × is a
  // control of its own and has no business inside one.
  const peppers = document.createElement("span");
  peppers.className = "picker-peppers";
  peppers.setAttribute("role", "spinbutton");
  peppers.setAttribute("aria-label", name);
  peppers.setAttribute("aria-valuemin", String(LEAST));
  peppers.setAttribute("aria-valuemax", String(MOST));
  peppers.tabIndex = 0;
  peppers.title = "Click to set the difficulty";
  element.append(peppers);

  let chosen = options.value;
  /** What the pointer is over, while it is over the row. */
  let hovered: number | undefined;

  const clear = document.createElement("button");
  if (clearable) {
    clear.type = "button";
    clear.className = "picker-clear";
    // Drawn rather than typed, for the reason the dialog's own × is drawn: the
    // multiplication sign sits on the font's math axis, which is not the middle
    // of the button under it, so a typed one is visibly off centre in its
    // hover ring. A constant from icons.ts, never anything from a database.
    clear.innerHTML = closeIcon();
    clear.title = "Remove the difficulty";
    clear.setAttribute("aria-label", `Remove the ${name.toLowerCase()}`);
    clear.addEventListener("click", () => report(undefined));
    element.append(clear);
  }

  function draw(): void {
    // Under the pointer the row *is* the pointer's figure, at full strength.
    const shown = hovered ?? chosen ?? 0;
    peppers.replaceChildren(...pepperGlyphs(shown));
    element.classList.toggle("is-previewing", hovered !== undefined);
    element.classList.toggle("is-unset", chosen === undefined);
    peppers.setAttribute("aria-valuenow", String(chosen ?? 0));
    peppers.setAttribute(
      "aria-valuetext",
      chosen === undefined
        ? "No difficulty proposed"
        : `${chosen} of ${DIFFICULTY.stars} peppers`,
    );
    // Nothing to take back, so the × is there but dead — greyed rather than
    // gone, or the row would change width as a figure is given and taken.
    clear.disabled = chosen === undefined;
  }

  function report(value: number | undefined): void {
    // A press that changes nothing tells nobody: on the tune's box every
    // report is a request, and pressing the figure you already gave should not
    // send one.
    if (value === chosen) return;
    chosen = value;
    draw();
    options.onChange(value);
  }

  /**
   * Where along the peppers a pointer event fell, as a fraction of their span.
   *
   * Measured from the ink — the first glyph's left edge to the last one's
   * right — rather than from the element's box, which carries the padding the
   * hover ground needs. Measuring the box would shift every boundary by a few
   * pixels against the peppers the eye is aiming at, which is exactly the
   * error a row like this cannot afford.
   */
  function fractionAt(event: PointerEvent | MouseEvent): number {
    const glyphs = peppers.children;
    const first = glyphs[0]?.getBoundingClientRect();
    const last = glyphs[glyphs.length - 1]?.getBoundingClientRect();
    if (first === undefined || last === undefined) return 0;
    const span = last.right - first.left;
    // A row of no width has not been laid out yet; nothing sensible can be
    // read off it, and dividing by it is worse.
    if (span === 0) return 0;
    return (event.clientX - first.left) / span;
  }

  // Bound to the peppers rather than to the row, so the hit area is exactly the
  // glyphs: the row holds the × as well, and is a flex item elsewhere that may
  // be stretched wider than its contents.
  peppers.addEventListener("pointermove", (event) => {
    hovered = starsAtFraction(fractionAt(event));
    draw();
  });

  peppers.addEventListener("pointerleave", () => {
    hovered = undefined;
    draw();
  });

  peppers.addEventListener("click", (event) => {
    report(starsAtFraction(fractionAt(event)));
  });

  peppers.addEventListener("keydown", (event) => {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? stepRating(chosen, 0.5)
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? stepRating(chosen, -0.5)
          : event.key === "Home"
            ? LEAST
            : event.key === "End"
              ? MOST
              : undefined;
    if (next !== undefined) {
      event.preventDefault();
      if (isStars(next)) report(next);
      return;
    }
    // The keyboard's ×, and offered only where the × itself is: the keyboard
    // may never do what the pointer is not allowed to.
    if (clearable && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      report(undefined);
    }
  });

  draw();
  return {
    element,
    set(value) {
      chosen = value;
      draw();
    },
  };
}
