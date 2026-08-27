/**
 * Turning the score's own coordinates into page pixels.
 *
 * Anything drawn *over* the stave rather than inside it — the playhead, the
 * burst when a note is found — needs this. The svg is scaled to whatever width
 * the layout gave it and sits below the controls above it, so neither its
 * scale nor its corner can be assumed.
 *
 * Kept in one place because the alternative is two copies of the same
 * `getBoundingClientRect` arithmetic drifting apart, and because measuring is
 * the expensive part: it forces the browser to settle the layout, so it is
 * done once per redraw and never per frame.
 */

export type ScoreMetrics = {
  /** Page pixels per svg unit. */
  scale: number;
  /** Where the svg's top-left sits inside the container. */
  offsetX: number;
  offsetY: number;
};

export const NO_SCORE: ScoreMetrics = { scale: 1, offsetX: 0, offsetY: 0 };

export function measureScore(
  container: HTMLElement,
  svg: SVGSVGElement,
): ScoreMetrics {
  const box = svg.getBoundingClientRect();
  const width = svg.viewBox.baseVal.width || box.width;
  const outer = container.getBoundingClientRect();

  return {
    scale: width === 0 ? 1 : box.width / width,
    // The svg does not begin at the container's corner — the score is padded
    // away from the controls above it — so its own offset has to be taken.
    offsetX: box.left - outer.left,
    offsetY: box.top - outer.top,
  };
}

/** Whether the viewer has asked their system for less movement. */
export const wantsLessMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Rebuild the score without the page jumping to the top.
 *
 * The score is most of the document's height and the page scrolls at document
 * level, so the moment a rebuild empties `#score` the document collapses and
 * the browser clamps the scroll offset to what is left. Reading a width off the
 * empty element a line later settles the layout and makes the clamp stick.
 * Nothing puts it back afterwards, so checking an answer — or undoing, or
 * changing the key — threw you to the top of the page.
 *
 * `renderMelody` is careful about exactly this, measuring before it clears,
 * which is why sixty hover repaints a second do not scroll the page. It is
 * teardown-then-build that defeats it, and this is where that happens.
 *
 * Restored rather than prevented because the teardown is real: the old view
 * genuinely does have to let go of the element before the new one takes it.
 * Both happen inside one task, so nothing is painted in between and there is
 * nothing to see.
 */
export function keepingScroll<T>(rebuild: () => T): T {
  // The framed pages scroll the score inside its own box; narrow layouts and
  // the rest of the site scroll the document. Guarding both costs nothing.
  const scroller = document.getElementById("score-scroll");
  const top = scroller?.scrollTop ?? 0;
  const x = window.scrollX;
  const y = window.scrollY;
  const result = rebuild();
  if (window.scrollX !== x || window.scrollY !== y) {
    window.scrollTo(x, y);
  }
  if (scroller && scroller.scrollTop !== top) {
    scroller.scrollTop = top;
  }
  return result;
}
