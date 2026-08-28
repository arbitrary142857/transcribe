import type {
  EventAnchor,
  MelodyRenderResult,
  ScoreLineBox,
} from "../render/render-melody.js";
import { measureScore, NO_SCORE, type ScoreMetrics } from "./score-overlay.js";

/**
 * The two marks showing which stretch of the music the section spans.
 *
 * The marks under the video are seconds, and these are where those seconds
 * fall on the page: one opening the passage and one closing it, ruled through
 * the staff as plain lines. Which is which is said by colour, and by each
 * standing on its own side of the music it holds. The pair
 * reads as a span even when they are lines apart, and — since either mark may
 * be dragged past the other — even when they cross, which is left visible
 * rather than tidied away. A crossed pair is a thing the visitor did and
 * should be able to see.
 *
 * They stand in the gaps between notes, never on one. See `section-bounds` for
 * why a gap is the only honest answer, and `bracketSpot` below for how a gap
 * becomes a place.
 *
 * Like the playhead, they live beside the score rather than inside it: the
 * score element has all of its children replaced whenever the pointer moves
 * over it, and anything put in there would be swept away within a frame.
 */
export type SectionBrackets = {
  /** Stand them in these two gaps, or nowhere at all. */
  show(start: number | undefined, end: number | undefined): void;
  /** Take on the score as it now stands, after a redraw. */
  onScore(rendered: MelodyRenderResult): void;
  destroy(): void;
};

/**
 * How far a mark stands off the note it hugs, in the score's own units.
 *
 * Wide enough to read as a gap rather than as a mark on the note — a notehead
 * is twelve units across — and narrow enough that the line is plainly *this*
 * note's, not the one on the other side of the gap.
 */
export const EDGE_GAP = 7;

/**
 * How wide the line is, and how far it stands past the staff at each end.
 *
 * The same at the top and at the bottom: a line ruled through something is
 * centred on it, and one hanging further below than above reads as having
 * slipped. It reaches past the staff at both ends so that it is findable as a
 * mark of its own rather than mistaken for a barline, and no further, so that
 * it stays clear of the notes above and below.
 */
const BAR_WIDTH = 3;
const OVERHANG = 9;

export type BracketSpot = { readonly line: number; readonly x: number };

/**
 * Where the mark for one gap stands: which line, and how far along it.
 *
 * Each mark hugs its own side of the gap — the opener the note it opens, the
 * closer the note it closes. Musically that is one place; on the page it is
 * two whenever the gap falls at a line break, and then the opener belongs at
 * the head of the next line and the closer at the tail of the one before.
 * That is what a repeat bracket does, and for the same reason: a mark on a
 * line whose music is outside the passage says the wrong thing.
 *
 * Off the end it takes the note it can reach instead. The gap after the last
 * note has nothing following it to open against, so the opening mark stands
 * after that note; the gap before the first is the mirror of it.
 *
 * Pure, and given only what the renderer measured, so every one of those cases
 * can be checked without a browser.
 */
export function bracketSpot(
  anchors: readonly EventAnchor[],
  lines: readonly ScoreLineBox[],
  boundary: number,
  side: "start" | "end",
): BracketSpot | undefined {
  if (anchors.length === 0 || lines.length === 0) return undefined;
  if (!Number.isInteger(boundary)) return undefined;
  if (boundary < 0 || boundary > anchors.length) return undefined;

  // The note this mark belongs to, and which way it faces from there. An
  // opener wants what follows the gap and a closer what precedes it; at the
  // ends of the music only one of the two exists, and the mark turns round
  // rather than having nowhere to stand.
  const after = boundary < anchors.length;
  const opening = side === "start" ? after : boundary === 0;
  const index = opening ? boundary : boundary - 1;

  const anchor = anchors[index];
  const line = anchor && lines[anchor.line];
  if (!anchor || !line) return undefined;

  // The other side of the gap, but only if it shares this line: across a line
  // break the stave's own edge is what the gap runs to.
  const neighbour = anchors[opening ? index - 1 : index + 1];
  const sameLine = neighbour?.line === anchor.line;

  const near = opening ? anchor.left : anchor.right;
  const far = opening
    ? sameLine
      ? neighbour!.right
      : line.left
    : sameLine
      ? neighbour!.left
      : line.right;

  // Its own gap off the note when the space allows it twice over, so the mark
  // is plainly attached to one note rather than floating between two. Where it
  // does not — sixteenths, which crowd — half of what there is, which is the
  // only place clear of both.
  const room = opening ? near - far : far - near;
  const x =
    room >= 2 * EDGE_GAP
      ? opening
        ? near - EDGE_GAP
        : near + EDGE_GAP
      : (near + far) / 2;

  // Never over the clef and never past the last barline: outside the stave's
  // own span it is not standing on the music at all.
  return { line: anchor.line, x: Math.min(Math.max(x, line.left), line.right) };
}

export function createSectionBrackets(container: HTMLElement): SectionBrackets {
  // A plain box, because a plain line is all this is. There is no shape here
  // an svg would be needed for, and a div is one element rather than several.
  const make = (side: "start" | "end"): HTMLElement => {
    const element = document.createElement("div");
    element.className = `section-bracket section-bracket-${side}`;
    element.hidden = true;
    container.append(element);
    return element;
  };

  const bars = { start: make("start"), end: make("end") };

  let rendered: MelodyRenderResult | undefined;
  /**
   * Where the drawn score sits, re-measured once per redraw and never per
   * frame — `getBoundingClientRect` settles the layout, and the score is
   * already repainting on every mouse move.
   */
  let metrics: ScoreMetrics = NO_SCORE;
  let at: { start?: number; end?: number } = {};

  function place(side: "start" | "end"): void {
    const bar = bars[side];
    const boundary = at[side];
    if (!rendered || boundary === undefined) {
      bar.hidden = true;
      return;
    }

    const spot = bracketSpot(rendered.anchors, rendered.lines, boundary, side);
    const line = spot && rendered.lines[spot.line];
    if (!spot || !line) {
      bar.hidden = true;
      return;
    }

    const { scale, offsetX, offsetY } = metrics;
    const width = BAR_WIDTH * scale;
    const height = (line.staffBottom - line.staffTop + 2 * OVERHANG) * scale;
    // Centred on the gap both ways: across, because the line is ruled on that
    // x rather than beside it; and down, because the overhang is the same at
    // both ends, which makes the box centred on the staff by construction.
    const left = spot.x * scale - width / 2;
    const top = (line.staffTop - OVERHANG) * scale;

    bar.style.width = `${width}px`;
    bar.style.height = `${height}px`;
    bar.style.transform = `translate3d(${offsetX + left}px, ${offsetY + top}px, 0)`;
    bar.hidden = false;
  }

  function placeBoth(): void {
    place("start");
    place("end");
  }

  return {
    show(start, end) {
      if (start === at.start && end === at.end) return;
      at = { start, end };
      placeBoth();
    },

    onScore(next) {
      rendered = next;
      metrics = measureScore(container, next.svg);
      placeBoth();
    },

    destroy() {
      bars.start.remove();
      bars.end.remove();
    },
  };
}
