/**
 * The look of one of assist mode's two tools, wherever it stands.
 *
 * The two are built in different files — the piano's sound switch in
 * `editor.ts`, "hear the notes" in `playback-panel.ts` — and neither knows
 * about the other. This is the one place that says what a locked tool looks
 * like, so they cannot drift apart: the same blue, the same faded icon, the
 * same padlock riding the top-left corner, and the same sentence when it is
 * pointed at.
 *
 * Both are `.playback-toggle` buttons already, and this only adds to them. It
 * does not take the press: a locked tool refuses at its own call site, because
 * a listener added here would fire in registration order beside the button's
 * own and could not be relied on to go first.
 *
 * The padlock is a sticker in the sense the keyboard hints are: it stands
 * above the button's top edge rather than inside it, on the left, clear of the
 * icon — a lock *on* the control rather than a picture of one in it.
 */

import { ASSIST_LOCKED } from "./assist.js";
import { lockClosedIcon } from "./icons.js";
import { pageTooltip } from "./tooltip.js";

export type AssistTool = {
  /** Whether it is locked right now, for the call site's own refusal. */
  locked(): boolean;
  setLocked(locked: boolean): void;
};

/**
 * Dress a toggle as an assist tool, locked until told otherwise.
 *
 * The blue is worn in both states. It says what kind of control this is, not
 * what state it is in — unlocking takes the padlock away and lifts the icon
 * back to full strength, and the tool stays marked as one of the two for as
 * long as it is on the page.
 */
export function asAssistTool(button: HTMLButtonElement): AssistTool {
  button.classList.add("assist-tool");

  const padlock = document.createElement("span");
  padlock.className = "assist-lock";
  padlock.innerHTML = lockClosedIcon();
  // Decoration: the sentence the hover raises is the accessible version of it,
  // and `aria-disabled` on the button is what a reader is actually told.
  padlock.setAttribute("aria-hidden", "true");
  button.append(padlock);

  let locked = true;

  // Said on hover rather than only on the press, which is the rule the piano's
  // eighty dead keys already follow: the moment to say a control does nothing
  // is before somebody presses it.
  button.addEventListener("mousemove", () => {
    if (locked) pageTooltip().say(ASSIST_LOCKED);
  });
  button.addEventListener("mouseleave", () => {
    if (locked) pageTooltip().say(undefined);
  });

  const tool: AssistTool = {
    locked: () => locked,
    setLocked(next) {
      locked = next;
      button.classList.toggle("is-locked", next);
      // Not `disabled`: a disabled button takes no pointer events at all, and
      // so could never be hovered to be told why it does nothing — which is
      // exactly when there is something to say.
      button.setAttribute("aria-disabled", String(next));
      padlock.hidden = !next;
    },
  };
  tool.setLocked(true);
  return tool;
}

/**
 * One of the two tools, drawn for the box that explains them.
 *
 * A `span` rather than a button, so it is unclickable and out of the tab order
 * without being greyed the way a disabled button would be — it is a picture of
 * a control, and the reader is being shown what to look for rather than
 * offered it here. Drawn unlocked, which is how they will find it.
 */
export function assistToolSample(icon: string, label: string): HTMLElement {
  const sample = document.createElement("span");
  sample.className = "playback-toggle assist-tool assist-sample";
  sample.setAttribute("role", "img");
  sample.setAttribute("aria-label", label);
  sample.innerHTML = `<span class="playback-toggle-icon">${icon}</span>`;
  return sample;
}
