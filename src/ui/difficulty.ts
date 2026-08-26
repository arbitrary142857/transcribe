/**
 * The one place a difficulty is drawn.
 *
 * Five chili peppers, filled to what `displayedDifficulty` says — and that
 * function is the only thing this asks. It does not know whether the figure
 * is the author's word alone or a blend with solvers' ratings, and it draws
 * a figure that is not in halves (a 3.29) by rounding to the nearest half.
 * The rounded figure is printed beside the peppers, one decimal always
 * ("1.5", "4.0"); the *stepper* stays number-free, so its buttons never
 * move as the figure changes.
 *
 * Every pepper keeps its red border; what varies is the fill. A half is the
 * outlined pepper with a filled one laid under it and clipped to its left
 * half — two glyphs, one `clip-path` — so no half-pepper ever has to be
 * drawn. The glyphs are Phosphor's, inlined in `icons.ts`, the outline and
 * fill weights of one silhouette, which is what makes the overlay line up.
 *
 * The card, the level's box and the stepper all draw their peppers through
 * `pepperGlyphs`, so the shape of a pepper is decided once. Changing the
 * graphic is changing this file. There is no unrated drawing: a published
 * level always has a difficulty now, and a draft without one simply shows
 * nothing where the peppers would be.
 */

import {
  DIFFICULTY,
  type DisplayedDifficulty,
} from "../shared/difficulty.js";
import { pepperFillIcon, pepperIcon } from "./icons.js";

export type PepperFill = "full" | "half" | "empty";

/** Which of the five peppers to fill, for this many. */
export function peppersToDraw(stars: number): PepperFill[] {
  const halves = Math.round(stars * 2);
  return Array.from({ length: DIFFICULTY.stars }, (_unused, at) => {
    const lit = halves - at * 2;
    return lit >= 2 ? "full" : lit === 1 ? "half" : "empty";
  });
}

/** The rating in words, for a title and for whoever is not looking. */
export function difficultyLabel(displayed: DisplayedDifficulty): string {
  return `Difficulty ${displayed.text} of ${DIFFICULTY.stars} peppers`;
}

/** One pepper, in one of its three states. */
export function pepperGlyph(fill: PepperFill): HTMLElement {
  const pepper = document.createElement("span");
  pepper.className = `pepper pepper-${fill}`;
  pepper.setAttribute("aria-hidden", "true");
  pepper.innerHTML = pepperIcon();
  if (fill !== "empty") {
    const lit = document.createElement("span");
    lit.className = "pepper-lit";
    lit.innerHTML = pepperFillIcon();
    pepper.append(lit);
  }
  return pepper;
}

/** The five peppers, filled to `stars`. */
export function pepperGlyphs(stars: number): HTMLElement[] {
  return peppersToDraw(stars).map(pepperGlyph);
}

/** The rating as a card or a box shows it: the peppers and their figure. */
export function createDifficulty(displayed: DisplayedDifficulty): HTMLElement {
  const element = document.createElement("span");
  element.className = "difficulty";
  element.setAttribute("role", "img");
  const label = difficultyLabel(displayed);
  element.setAttribute("aria-label", label);
  element.title = label;

  const text = document.createElement("span");
  text.className = "difficulty-text";
  text.setAttribute("aria-hidden", "true");
  text.textContent = displayed.text;
  element.append(...pepperGlyphs(displayed.stars), text);
  return element;
}
