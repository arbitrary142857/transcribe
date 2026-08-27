import { isTypingTarget } from "./typing-guard.js";

/**
 * The button that shows every keyboard shortcut, for as long as it is held.
 *
 * The shortcuts live on their controls as stickers — `key-sticker` badges in
 * or on each button's corner — and stay hidden until this is held down, so
 * the controls wear their icons plainly and the keys appear all at once when
 * they are asked for. A hold rather than a toggle: the question "what was
 * that key again?" lasts a moment, and a mode would have to be remembered
 * and turned off.
 *
 * Its face is the letter K drawn as a key sticker — its own shortcut, always
 * visible, in the same dress the stickers it summons wear — with the words
 * beside it. Held by pointer or by K itself, which works before the button
 * has even been found. The class it flips lives on `<body>`, so one press
 * reveals the stickers of every panel at once, whichever file drew them.
 */

/** The class the page wears while the shortcuts are showing. */
const SHOWING = "show-keys";

function show(on: boolean): void {
  document.body.classList.toggle(SHOWING, on);
  for (const button of document.querySelectorAll(".keys-button")) {
    button.setAttribute("aria-pressed", String(on));
  }
}

/** Whether the page-wide listeners are already wired; one page needs one set. */
let wired = false;

function wireOnce(): void {
  if (wired) return;
  wired = true;

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "k") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event)) return;
    show(true);
    // Firefox's find-as-you-type would otherwise open over the page.
    event.preventDefault();
  });
  // On keyup unconditionally: the K that went down over a button must still
  // put the stickers away when it comes up somewhere else.
  window.addEventListener("keyup", (event) => {
    if (event.key.toLowerCase() === "k") show(false);
  });
  // A hold cannot outlive the page's attention: alt-tabbing away with K down
  // would otherwise leave the stickers on with no keyup ever coming.
  window.addEventListener("blur", () => show(false));
}

export function createKeysButton(): HTMLButtonElement {
  wireOnce();

  const button = document.createElement("button");
  button.type = "button";
  button.className = "keys-button";
  button.title = "Hold to see the keyboard shortcuts";
  button.setAttribute("aria-label", "Show keyboard shortcuts while held");
  button.setAttribute("aria-pressed", "false");
  button.innerHTML =
    `<kbd class="keys-button-k">K</kbd>` +
    `<span class="keys-button-words">Reveal Keyboard Shortcuts</span>`;

  button.addEventListener("pointerdown", (event) => {
    // The button is a lens, not a control with an effect: no focus ring taken,
    // no click to fire, just the stickers for as long as it is pressed.
    event.preventDefault();
    show(true);
  });
  for (const done of ["pointerup", "pointerleave", "pointercancel"] as const) {
    button.addEventListener(done, () => show(false));
  }
  // A keyboard user landing on the button holds it with the key it names; the
  // global K listener already answers that, so a press here has nothing to add.

  return button;
}
