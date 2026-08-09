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

export type Tooltip = {
  /** Say this beside the pointer, or clear it with `undefined`. */
  say(message: string | undefined): void;
  destroy(): void;
};

export function createTooltip(): Tooltip {
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
    say(message) {
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
      const x = Math.min(
        Math.max(pointerX, box.width / 2 + 8),
        window.innerWidth - box.width / 2 - 8,
      );
      const y = Math.max(pointerY - RISE, box.height + 8);
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;

      timer = setTimeout(() => {
        if (element.textContent === showing) hide();
      }, LINGER_MS);
    },

    destroy() {
      hide();
      element.remove();
    },
  };
}
