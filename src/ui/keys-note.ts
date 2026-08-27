import { isTypingTarget } from "./typing-guard.js";

/**
 * The line that says how to see every keyboard shortcut, and the listener that
 * answers it.
 *
 * The shortcuts live on their controls as stickers — `key-sticker` caps riding
 * the top edge of each button — and stay hidden until K is held, so the
 * controls wear their icons plainly and the keys appear all at once when they
 * are asked for. A hold rather than a toggle: the question "what was that key
 * again?" lasts a moment, and a mode would have to be remembered and turned
 * off again.
 *
 * A footnote rather than a button. It was a button once, held by the pointer
 * as well as by K, and the box it needed made a control out of what is only an
 * instruction — a thing to press, sitting among things to press, that did
 * nothing lasting when pressed. What is left is the sentence and the cap, in
 * the same dress the stickers it summons wear, and the key itself is the only
 * way in. The class it flips lives on `<body>`, so one press reveals the
 * stickers of every panel at once, whichever file drew them.
 */

/** The class the page wears while the shortcuts are showing. */
const SHOWING = "show-keys";

function show(on: boolean): void {
  document.body.classList.toggle(SHOWING, on);
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
  // On keyup unconditionally: a K that went down over a control must still put
  // the stickers away when it comes up somewhere else.
  window.addEventListener("keyup", (event) => {
    if (event.key.toLowerCase() === "k") show(false);
  });
  // A hold cannot outlive the page's attention: alt-tabbing away with K down
  // would otherwise leave the stickers on with no keyup ever coming.
  window.addEventListener("blur", () => show(false));
}

export function createKeysNote(): HTMLElement {
  wireOnce();

  const note = document.createElement("p");
  note.className = "keys-note";
  // Every part is a constant from this file, which is the one rule that lets
  // this be innerHTML at all.
  note.innerHTML =
    `Hold <kbd class="keys-note-k">K</kbd> to reveal keyboard shortcuts.`;
  return note;
}
