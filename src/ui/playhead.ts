import type { MelodyRenderResult } from "../render/render-melody.js";

/**
 * The marker showing which note is sounding.
 *
 * It steps from note to note rather than sliding: it sits on whatever is
 * sounding and jumps when the next thing begins, so the timing of each jump is
 * that note's own length. That also means it is always exactly on a drawn note
 * rather than somewhere between two — VexFlow does not space notes evenly in
 * time within a bar, so anything that slid would drift off the noteheads.
 *
 * It lives beside the score rather than inside it. The score element has all of
 * its children replaced on every redraw — which happens on every mouse move, to
 * paint the note under the pointer — so anything put in there would be swept
 * away within a frame of being drawn.
 */
export type Playhead = {
  /** Put it on this event, or nowhere at all. */
  show(eventIndex: number | undefined): void;
  /** Take on the score as it now stands, after a redraw. */
  onScore(rendered: MelodyRenderResult): void;
  destroy(): void;
};

/** How wide the marker is in the score's own units — a little over a notehead. */
const WIDTH = 18;

export function createPlayhead(container: HTMLElement): Playhead {
  const bar = document.createElement("div");
  bar.className = "playhead";
  bar.hidden = true;
  container.append(bar);

  let rendered: MelodyRenderResult | undefined;
  /** The score's own units per css pixel, and where its top-left sits. */
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let showing: number | undefined;

  /**
   * Re-measure the drawn score.
   *
   * Done once per redraw and never per frame: `getBoundingClientRect` forces the
   * browser to settle the layout, and asking for that sixty times a second
   * alongside the score's own hover redraws is how a page starts to stutter.
   */
  function measure(): void {
    if (!rendered) return;
    const svg = rendered.svg;
    const box = svg.getBoundingClientRect();
    const width = svg.viewBox.baseVal.width || box.width;
    scale = width === 0 ? 1 : box.width / width;

    // The svg does not begin at the container's corner — the score is padded
    // away from the controls above it — so its own offset has to be taken.
    const outer = container.getBoundingClientRect();
    offsetX = box.left - outer.left;
    offsetY = box.top - outer.top;
  }

  function place(): void {
    if (!rendered || showing === undefined) {
      bar.hidden = true;
      return;
    }
    const anchor = rendered.anchors[showing];
    const line = anchor && rendered.lines[anchor.line];
    if (!anchor || !line) {
      bar.hidden = true;
      return;
    }

    const height = (line.bottom - line.top) * scale;
    bar.style.width = `${WIDTH * scale}px`;
    bar.style.height = `${height}px`;
    bar.style.transform = `translate3d(${
      offsetX + (anchor.x * scale - (WIDTH * scale) / 2)
    }px, ${offsetY + line.top * scale}px, 0)`;
    bar.hidden = false;
  }

  return {
    show(eventIndex) {
      if (eventIndex === showing) return;
      showing = eventIndex;
      place();
    },

    onScore(next) {
      rendered = next;
      measure();
      place();
    },

    destroy() {
      bar.remove();
    },
  };
}
