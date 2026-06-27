/**
 * Whether a keystroke belongs to the control the user is operating.
 *
 * The page listens for single keys on the window — digits write durations,
 * letters mark timestamps — and every one of those listeners must stand down
 * while the user is typing *into* something: a "1" in a timestamp box is a
 * digit of a number, not a whole note. One definition, shared by all of them,
 * because two guards that drift apart turn into one shortcut that fires from
 * inside a field somewhere.
 *
 * Sliders count as typing targets too: their arrow keys are how a slider is
 * driven from the keyboard, and the editor's arrows must not fight them.
 * Buttons do not count — focus rests on whatever was last clicked, and typing
 * a digit after clicking a duration cell must keep writing durations.
 */
const BUTTON_TYPES = new Set(["button", "submit", "reset", "checkbox", "radio"]);

export function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return target instanceof HTMLInputElement && !BUTTON_TYPES.has(target.type);
}
