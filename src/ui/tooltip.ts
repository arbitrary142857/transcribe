/**
 * A word next to the pointer when a control refuses.
 *
 * The page used to answer these in a line under the toolbar, which had two
 * problems. It was nowhere near the thing you had just pressed — the piano is
 * at the bottom of the window and the line was at the top — and text appearing
 * there made the whole bar grow, shoving the music down a line for as long as
 * the message stood.
 *
 * This is for refusals and for hover explanations only: reactions to something
 * you just did, which are over as soon as you have read them. Standing facts —
 * why Check is greyed, what the tempo is, that a save failed — keep their
 * boxes, because they are true whether or not you happen to be pointing at
 * anything.
 *
 * One element for the whole page. Two tooltips at once would mean two things
 * refusing at once, which is not a state the page has.
 */

/** How long a message stands before fading, in milliseconds. */
const LINGER_MS = 2400;

/** How far above the pointer it sits, in pixels. */
const RISE = 14;

/** Kept from the last pointer event, since a refusal is raised deep inside a
 * click handler that has long since lost the event that caused it. */
let pointerX = 0;
let pointerY = 0;
let tracking = false;

function trackPointer(): void {
  if (tracking) return;
  tracking = true;
  window.addEventListener(
    "pointermove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    },
    { passive: true },
  );
}

/** A point in viewport pixels for a message to sit above. */
export type Spot = { readonly x: number; readonly y: number };

export type Tooltip = {
  /**
   * Say this above `at`, or beside the pointer when no place is given.
   *
   * A place is what a refusal raised from the keyboard needs. The pointer is
   * the right anchor for an explanation of whatever is being hovered, and the
   * wrong one for everything else: pressing a key does not move the mouse, so
   * the answer appeared wherever the mouse had been abandoned — or, if it had
   * not moved at all since the page loaded, in the corner of the window.
   */
  say(message: string | undefined, at?: Spot): void;
};

let shared: Tooltip | undefined;

/**
 * The page's tooltip, made the first time anything wants to speak.
 *
 * There is one because there is only ever one thing being pointed at. It is
 * also the only way the controls beside the video can have one at all: the
 * editor made its own and threw it away on every rebuild, and the playback panel
 * outlives a great many of those.
 */
export function pageTooltip(): Tooltip {
  return (shared ??= createTooltip());
}

function createTooltip(): Tooltip {
  trackPointer();

  const element = document.createElement("div");
  element.className = "tooltip";
  element.setAttribute("role", "status");
  element.hidden = true;
  document.body.append(element);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let showing: string | undefined;

  function hide(): void {
    clearTimeout(timer);
    showing = undefined;
    element.hidden = true;
  }

  return {
    say(message, at) {
      if (message === undefined) {
        hide();
        return;
      }
      // The same refusal twice running is the same refusal: restarted rather
      // than redrawn, so pressing a dead control repeatedly keeps it up.
      clearTimeout(timer);
      showing = message;
      element.textContent = message;
      element.hidden = false;

      // Placed after unhiding, so the box has a width to be centred on and can
      // be kept inside the window rather than half off the edge.
      const box = element.getBoundingClientRect();
      const spot = at ?? { x: pointerX, y: pointerY };
      const x = Math.min(
        Math.max(spot.x, box.width / 2 + 8),
        window.innerWidth - box.width / 2 - 8,
      );
      const y = Math.max(spot.y - RISE, box.height + 8);
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;

      timer = setTimeout(() => {
        if (element.textContent === showing) hide();
      }, LINGER_MS);
    },
  };
}
