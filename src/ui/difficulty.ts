/**
 * The one place a difficulty is drawn.
 *
 * Five stars and a number, lit to what `displayedDifficulty` says — and that
 * function is the only thing this asks. It does not know whether the figure
 * is the author's word or a blend with play data, and it draws a figure that
 * is not in halves (a 2.37, one day) by rounding to the nearest half, with
 * the exact number printed beside. A level nobody has rated draws one hollow
 * star with a question mark and says so, because five hollow stars would
 * read as the worst rating there is rather than as no rating at all.
 *
 * The card, the level's box, the play bar and the picker all draw their stars
 * through `starGlyphs`, so the shape of a star is decided once. Changing the
 * graphic is changing this file.
 */

import {
  DIFFICULTY,
  type DisplayedDifficulty,
} from "../shared/difficulty.js";

export type StarFill = "full" | "half" | "empty";

/** Which of the five stars to light, for this many. */
export function starsToDraw(stars: number): StarFill[] {
  const halves = Math.round(stars * 2);
  return Array.from({ length: DIFFICULTY.stars }, (_unused, at) => {
    const lit = halves - at * 2;
    return lit >= 2 ? "full" : lit === 1 ? "half" : "empty";
  });
}

/** The rating in words, for a title and for whoever is not looking. */
export function difficultyLabel(displayed: DisplayedDifficulty | undefined): string {
  return displayed === undefined
    ? "Not rated yet"
    : `Difficulty ${displayed.text} of ${DIFFICULTY.stars} stars`;
}

/**
 * One star, in one of its three states.
 *
 * A half is the hollow star with a lit one clipped to its left half laid
 * over it — two glyphs, one `width: 50%; overflow: hidden` — so that no font
 * has to have a half-star glyph.
 */
export function starGlyph(fill: StarFill): HTMLElement {
  const star = document.createElement("span");
  star.className = `star star-${fill}`;
  star.setAttribute("aria-hidden", "true");
  star.textContent = "★";
  if (fill === "half") {
    const lit = document.createElement("span");
    lit.className = "star-half-lit";
    lit.textContent = "★";
    star.append(lit);
  }
  return star;
}

/** The five stars, lit to `stars`. */
export function starGlyphs(stars: number): HTMLElement[] {
  return starsToDraw(stars).map(starGlyph);
}

/** The rating as a card, a box or a bar shows it. */
export function createDifficulty(displayed: DisplayedDifficulty | undefined): HTMLElement {
  const element = document.createElement("span");
  element.className = "difficulty";
  element.setAttribute("role", "img");
  const label = difficultyLabel(displayed);
  element.setAttribute("aria-label", label);
  element.title = label;

  if (displayed === undefined) {
    element.classList.add("is-unrated");
    const mark = document.createElement("span");
    mark.className = "difficulty-unrated";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "?";
    element.append(starGlyph("empty"), mark);
    return element;
  }

  const text = document.createElement("span");
  text.className = "difficulty-text";
  text.setAttribute("aria-hidden", "true");
  text.textContent = displayed.text;
  element.append(...starGlyphs(displayed.stars), text);
  return element;
}
