/**
 * A small labelled button with its keyboard shortcut riding its corner.
 *
 * The shortcut is a `key-sticker`: out of the layout, so the chip is the same
 * size whether or not the reveal button is showing it, and positioned half
 * off the chip's edge like every other sticker on the page.
 */

/**
 * Whether this looks like an Apple keyboard.
 *
 * Only decides which way to print the shortcut; both are listened for either
 * way, so guessing wrong costs a label rather than a feature.
 */
const APPLE = /mac|iphone|ipad|ipod/i.test(
  navigator.userAgent + " " + (navigator.platform ?? ""),
);

/** The modifier as its own keyboard prints it. */
export const UNDO_KEY = APPLE ? "⌘Z" : "Ctrl+Z";
export const REDO_KEY = APPLE ? "⇧⌘Z" : "Ctrl+Y";

export function chip(
  label: string,
  shortcut: string,
  run: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  // Both halves are constants from the caller, never anything out of the
  // database — the one rule that lets this be innerHTML at all.
  button.innerHTML = `<kbd class="key-sticker">${shortcut}</kbd>${label}`;
  button.addEventListener("click", run);
  return button;
}
