import type { Melody } from "../music/melody.js";
import { Note } from "../music/note-event.js";
import {
  type MelodyRenderResult,
  type NoteHitRegion,
  renderMelody,
  type RenderMelodyOptions,
} from "./render-melody.js";

export type MelodyView = {
  /** The melody index anchoring the selection, if any. */
  getAnchor(): number | undefined;
  /** Every selected index: the anchor's whole tied group. */
  getSelection(): ReadonlySet<number>;
  /** Select a note and its tied group; `undefined` clears the selection. */
  select(melodyIndex: number | undefined): void;
  /**
   * Move the selection to the neighbouring note, stepping over a whole tied
   * group at a time. With nothing selected, takes the first or last note.
   */
  moveSelection(direction: -1 | 1): void;
  /** Redraw from the melody's current state, keeping the selection. */
  refresh(): void;
  onSelectionChange(listener: (anchor: number | undefined) => void): void;
  destroy(): void;
};

/**
 * Which note a point lands on, or `undefined` for empty space.
 *
 * Overlapping regions are possible once padding is added, so the nearest
 * notehead centre wins rather than whichever happened to be drawn first.
 */
function hitTest(
  regions: readonly NoteHitRegion[],
  x: number,
  y: number,
): number | undefined {
  let best: NoteHitRegion | undefined;
  let bestDistance = Infinity;

  for (const region of regions) {
    const inside =
      x >= region.x &&
      x <= region.x + region.w &&
      y >= region.y &&
      y <= region.y + region.h;
    if (!inside) {
      continue;
    }

    const dx = x - (region.x + region.w / 2);
    const dy = y - (region.y + region.h / 2);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = region;
      bestDistance = distance;
    }
  }

  return best?.melodyIndex;
}

/**
 * Render `melody` into a container and keep it interactive: clicking a notehead
 * or stem selects that note along with anything tied to it, clicking anywhere
 * else clears the selection, and hovering previews what a click would select.
 */
export function createMelodyView(
  melody: Melody,
  options: RenderMelodyOptions = {},
): MelodyView {
  const elementId = options.elementId ?? "output";
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`No element with id "${elementId}"`);
  }

  const listeners: ((anchor: number | undefined) => void)[] = [];
  let anchor: number | undefined;
  let hoverAnchor: number | undefined;
  let rendered: MelodyRenderResult;

  /** The whole tied group around an anchor — a tie selects as one unit. */
  const groupOf = (index: number | undefined): ReadonlySet<number> =>
    index === undefined ? new Set() : new Set(melody.getTiedGroup(index));

  const getSelection = () => groupOf(anchor);

  function draw(): void {
    rendered = renderMelody(melody, {
      ...options,
      elementId,
      selected: groupOf(anchor),
      hovered: groupOf(hoverAnchor),
    });
  }

  /** Convert client coordinates into the svg's own user space. */
  function toUserSpace(
    event: MouseEvent,
  ): { x: number; y: number } | undefined {
    const matrix = rendered.svg.getScreenCTM();
    if (!matrix) {
      return undefined;
    }
    const point = rendered.svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const { x, y } = point.matrixTransform(matrix.inverse());
    return { x, y };
  }

  function noteAt(event: MouseEvent): number | undefined {
    const point = toUserSpace(event);
    return point ? hitTest(rendered.regions, point.x, point.y) : undefined;
  }

  /**
   * Selection runs on mousedown rather than click. Hovering redraws the score,
   * so the node under the pointer is replaced whenever the mouse twitches — and
   * a `click` is only delivered if mousedown and mouseup land on the same node,
   * which makes clicks drop unpredictably. Nothing here depends on the node
   * that was hit: the listener is on the container, which is never replaced,
   * and the note is found by geometry.
   */
  function onMouseDown(event: MouseEvent): void {
    const hit = noteAt(event);
    // Pressing any note of the current selection clears the whole selection,
    // as does pressing empty space. Comparing against the anchor alone would
    // mean that, with X tied to Y, pressing X and then Y just moved the anchor
    // from one to the other and the pair never let go.
    const alreadySelected = hit !== undefined && getSelection().has(hit);
    select(alreadySelected ? undefined : hit);
  }

  function onMouseMove(event: MouseEvent): void {
    const hit = noteAt(event);
    element!.style.cursor = hit === undefined ? "" : "pointer";
    if (hit === hoverAnchor) {
      return;
    }
    hoverAnchor = hit;
    draw();
  }

  function onMouseLeave(): void {
    element!.style.cursor = "";
    if (hoverAnchor === undefined) {
      return;
    }
    hoverAnchor = undefined;
    draw();
  }

  function select(melodyIndex: number | undefined): void {
    if (melodyIndex === anchor) {
      return;
    }
    anchor = melodyIndex;
    draw();
    for (const listener of listeners) {
      listener(anchor);
    }
  }

  /** The next selectable note from `from`, skipping rests. */
  function nextNote(from: number, direction: -1 | 1): number | undefined {
    for (let i = from; i >= 0 && i < melody.eventCount; i += direction) {
      if (melody.getEvent(i) instanceof Note) {
        return i;
      }
    }
    return undefined;
  }

  function moveSelection(direction: -1 | 1): void {
    if (anchor === undefined) {
      // Nothing selected yet: come in from whichever end you are heading from.
      const from = direction > 0 ? 0 : melody.eventCount - 1;
      const found = nextNote(from, direction);
      if (found !== undefined) select(found);
      return;
    }

    // Step over the whole tied group, so a tied pair counts as one note.
    const group = melody.getTiedGroup(anchor);
    const edge = direction > 0 ? group[group.length - 1]! : group[0]!;
    const found = nextNote(edge + direction, direction);
    if (found !== undefined) {
      select(found);
    }
  }

  // Bars are justified to the container, so a resize needs a fresh layout.
  // Listening on the window rather than the element avoids a feedback loop:
  // the element's width comes from CSS, never from the score inside it.
  let resizePending = false;
  let lastWidth = element.clientWidth;

  function onResize(): void {
    if (resizePending || element!.clientWidth === lastWidth) {
      return;
    }
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      lastWidth = element!.clientWidth;
      draw();
    });
  }

  draw();
  element.addEventListener("mousedown", onMouseDown);
  element.addEventListener("mousemove", onMouseMove);
  element.addEventListener("mouseleave", onMouseLeave);
  window.addEventListener("resize", onResize);

  return {
    getAnchor: () => anchor,
    getSelection,
    select,
    moveSelection,
    refresh: draw,
    onSelectionChange(listener) {
      listeners.push(listener);
    },
    destroy() {
      element.removeEventListener("mousedown", onMouseDown);
      element.removeEventListener("mousemove", onMouseMove);
      element.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onResize);
      element.replaceChildren();
    },
  };
}
