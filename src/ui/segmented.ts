/**
 * A segmented switch: several choices, exactly one taken.
 *
 * The same `.mode-switch` the signature bar, the playback panel and the
 * hearing switch each draw by hand, made once for the next one — the level
 * filter — which has no reason of its own to differ. The three that exist
 * are left as they are; nothing about them is wrong.
 *
 * Clicking the choice already taken is nothing: exactly one is always on, and
 * never none, so there is no change to report.
 */

export type Segmented<T extends string> = {
  readonly element: HTMLElement;
  /** Draw a choice as taken, without telling anybody. */
  set(value: T): void;
};

export function createSegmented<T extends string>(options: {
  /** For `aria-label` on the group. */
  label: string;
  choices: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}): Segmented<T> {
  const element = document.createElement("div");
  element.className = "mode-switch";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", options.label);

  let taken = options.value;

  const buttons = options.choices.map((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-option";
    button.textContent = choice.label;
    button.addEventListener("click", () => {
      if (choice.value === taken) return;
      set(choice.value);
      options.onChange(choice.value);
    });
    element.append(button);
    return { button, value: choice.value };
  });

  function set(value: T): void {
    taken = value;
    for (const each of buttons) {
      const on = each.value === value;
      each.button.setAttribute("aria-pressed", String(on));
      each.button.classList.toggle("is-on", on);
    }
  }

  set(taken);
  return { element, set };
}
