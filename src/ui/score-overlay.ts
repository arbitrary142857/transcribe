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
