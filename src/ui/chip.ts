/**
 * A small labelled button with its keyboard shortcut printed on it.
 *
 * The shortcut is on the control rather than hidden in a tooltip, which is the
 * only way anybody finds out one exists — the same reasoning as the action
 * buttons in the editor, which print theirs in a `kbd` too.
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
  button.title = `${label} (${shortcut})`;
  // Both halves are constants from the caller, never anything out of the
  // database — the one rule that lets this be innerHTML at all.
  button.innerHTML = `${label}<kbd class="chip-key">${shortcut}</kbd>`;
  button.addEventListener("click", run);
  return button;
}
