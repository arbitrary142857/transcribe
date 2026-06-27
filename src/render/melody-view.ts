import type { Melody } from "../music/melody.js";
import { Rest } from "../music/note-event.js";
import {
  type MelodyRenderResult,
  type NoteHitRegion,
  renderMelody,
  type RenderMelodyOptions,
} from "./render-melody.js";

export type MelodyView = {
  /** The selected melody index, if any. */
  getAnchor(): number | undefined;
  /** Select one event; `undefined` clears the selection. */
  select(melodyIndex: number | undefined): void;
  /**
   * Move the selection to the neighbouring event, one at a time — including
   * within a tied run. With nothing selected, takes the first or last.
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

  /**
   * One event, selected on its own.
   *
   * A tied run is one sound but it is several events, and each of them has its
   * own length to edit. Selecting the run as a unit made the parts unreachable;
   * pitch still travels across the whole run, because `Melody.setPitch` applies
   * it to the group whichever member is asked.
   */
  const only = (index: number | undefined): ReadonlySet<number> =>
    index === undefined ? new Set() : new Set([index]);

  /**
   * The rests past the last note, which are not music yet.
   *
   * They are the spare bar the next note gets written into, and drawing them
   * faintly is what shows where writing has reached without the score ever
   * having a ragged, half-empty bar on the end.
   */
  function trailingRests(): ReadonlySet<number> {
    const ghost = new Set<number>();
    for (let i = melody.eventCount - 1; i >= 0; i--) {
      if (!(melody.getEvent(i) instanceof Rest)) {
        break;
      }
      ghost.add(i);
    }
    return ghost;
  }

  /**
   * Keep the selection and hover inside the melody.
   *
   * The view holds indices into a melody that edits mutate underneath it, and
   * an edit can leave it shorter than it was — silencing the last note in a bar
   * merges every rest in that bar into one. So an index taken before an edit
   * may name nothing by the time the score is redrawn. Clamping to the last
   * event keeps the selection near where it was rather than dropping it.
   */
  function clampToMelody(): void {
    const last = melody.eventCount - 1;
    if (anchor !== undefined && anchor > last) {
      anchor = last >= 0 ? last : undefined;
    }
    if (hoverAnchor !== undefined && hoverAnchor > last) {
      hoverAnchor = undefined;
    }
  }

  function draw(): void {
    clampToMelody();
    rendered = renderMelody(melody, {
      ...options,
      elementId,
      selected: only(anchor),
      hovered: only(hoverAnchor),
      ghost: trailingRests(),
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
    // Pressing the selected event lets go of it, as does pressing empty space.
    select(hit === anchor ? undefined : hit);
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

  /**
   * `index` if the melody has an event there.
   *
   * Every event is selectable, rests included: a rest is the room the next note
   * is written into, so stepping over them would put most of the page out of
   * reach of the arrow keys.
   */
  const inRange = (index: number): number | undefined =>
    index >= 0 && index < melody.eventCount ? index : undefined;

  function moveSelection(direction: -1 | 1): void {
    if (anchor === undefined) {
      // Nothing selected yet: come in from whichever end you are heading from.
      const found = inRange(direction > 0 ? 0 : melody.eventCount - 1);
      if (found !== undefined) select(found);
      return;
    }

    const found = inRange(anchor + direction);
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
