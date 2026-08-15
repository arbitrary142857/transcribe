/**
 * A switch: something that is on or off, and stays that way.
 *
 * The page already has two things that look like this and are not. A
 * `.mode-switch` is a segmented control — several choices, exactly one taken —
 * and a `.playback-toggle` is an icon button that happens to light up. Neither
 * says "this is a setting" at a glance, which a track with a knob in it does
 * before it is read.
 *
 * `role="switch"` rather than a checkbox, because there is no form here and
 * nothing to submit: it is a control that acts the moment it is pressed.
 */

export type Switch = {
  readonly element: HTMLElement;
  /** Draw it on or off, without telling anybody it changed. */
  set(on: boolean): void;
};

export type SwitchOptions = {
  label: string;
  /** Why it is worth turning on, for the pointer and for a screen reader. */
  title?: string;
  checked?: boolean;
  onChange: (on: boolean) => void;
};

export function createSwitch({
  label,
  title,
  checked = false,
  onChange,
}: SwitchOptions): Switch {
  let on = checked;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "switch";
  button.setAttribute("role", "switch");

  const track = document.createElement("span");
  track.className = "switch-track";
  const knob = document.createElement("span");
  knob.className = "switch-knob";
  track.append(knob);

  const text = document.createElement("span");
  text.className = "switch-label";
  text.textContent = label;

  // The words first and the switch after, which is the order the sentence runs
  // in: the thing, then whether it is on.
  button.append(text, track);

  function draw(): void {
    button.setAttribute("aria-checked", String(on));
    button.classList.toggle("is-on", on);
  }

  button.addEventListener("click", () => {
    on = !on;
    draw();
    onChange(on);
  });

  draw();

  return {
    element: button,
    set(next) {
      on = next;
      draw();
    },
  };
}
