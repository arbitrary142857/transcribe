/**
 * What the transcription is called, and what its author wants said about it.
 *
 * A disclosure in the bar above the music rather than a step on the way out,
 * because a title is not something you decide at the end: the piece has a name
 * before the first note is written down, and this is where it goes. Nothing
 * here is a submission — it is simply the state of the thing being edited, and
 * Submit sends whatever is in it.
 *
 * Built once and mutated, never rebuilt. Every field is a box somebody may be
 * typing into, and rebuilding one between keystrokes takes the caret with it —
 * the same reason the link box and the timing panel are left standing.
 */

import {
  countCharacters,
  LIMITS,
  type TranscriptionDetails,
} from "../shared/transcription.js";
import { createDisclosure } from "./disclosure.js";
import { limitTyping } from "./text-entry.js";

export type DetailsPanel = {
  /** The toggle and its panel, to be put in the bar. */
  readonly element: HTMLElement;
  update(details: TranscriptionDetails): void;
  /** Open the panel and put the caret in the title. */
  focusTitle(): void;
};

export type FieldOptions = {
  label: string;
  hint: string;
  max: number;
  required?: boolean;
  lines?: number;
};

export type Field = {
  readonly row: HTMLElement;
  readonly input: HTMLInputElement | HTMLTextAreaElement;
  show(value: string): void;
};

/** How many fields have been made, so that no two ever share an id. */
let made = 0;

/**
 * One labelled box with a live count of what is in it.
 *
 * Exported because the details modal wants the very same three boxes without
 * the disclosure around them: same limit, same counter, same red star.
 */
export function createField(options: FieldOptions, onInput: () => void): Field {
  const row = document.createElement("div");
  row.className = "details-field";

  const label = document.createElement("label");
  label.className = "setup-link-label details-label";
  label.textContent = options.label;
  if (options.required) {
    // Marked in the same red the app uses for the note under the cursor, and
    // hidden from a screen reader, which is told by aria-required instead.
    const mark = document.createElement("span");
    mark.className = "details-required";
    mark.textContent = "*";
    mark.setAttribute("aria-hidden", "true");
    label.append(mark);
  }

  const input = options.lines
    ? document.createElement("textarea")
    : document.createElement("input");
  if (input instanceof HTMLTextAreaElement) {
    input.rows = options.lines!;
  } else {
    input.type = "text";
  }
  input.className = "setup-link-input details-input";
  input.autocomplete = "off";
  input.spellcheck = true;
  input.placeholder = options.hint;
  // No `maxlength`, still: it counts UTF-16 units while every rule here counts
  // characters, so `maxlength="128"` would cut a title of family emoji off at
  // sixty-two of them. `limitTyping` does the same job counting the same way
  // the database does, so the box, the counter and the CHECK constraint agree.
  limitTyping(input, () => options.max);
  if (options.required) {
    input.setAttribute("aria-required", "true");
  }

  // Numbered as well as named: the same three fields can stand in the editor's
  // bar and in a modal at once, and a label pointing at the wrong box is
  // worse than no label.
  made += 1;
  const id = `details-${options.label.toLowerCase()}-${made}`;
  input.id = id;
  label.htmlFor = id;

  const count = document.createElement("span");
  count.className = "details-count";

  const head = document.createElement("div");
  head.className = "details-head";
  head.append(label, count);

  const showCount = () => {
    const used = countCharacters(input.value);
    count.textContent = `${used}/${options.max}`;
    count.classList.toggle("is-wrong", used > options.max);
    input.setAttribute("aria-invalid", String(used > options.max));
  };

  input.addEventListener("input", () => {
    showCount();
    onInput();
  });

  row.append(head, input);
  showCount();

  return {
    row,
    input,
    show(value) {
      // Declined while the caret is in this box — the same rule TimeField
      // follows, and for the same reason.
      if (document.activeElement === input) return;
      input.value = value;
      showCount();
    },
  };
}

export function createDetailsPanel(
  onChange: (details: TranscriptionDetails) => void,
): DetailsPanel {
  const element = document.createElement("div");
  element.className = "key-picker details-picker";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "key-toggle";
  toggle.setAttribute("aria-expanded", "false");

  const value = document.createElement("span");
  value.className = "key-toggle-value details-title";

  const label = document.createElement("span");
  label.className = "key-toggle-label";
  label.textContent = "Details";
  toggle.append(label, value);

  const panel = document.createElement("div");
  panel.className = "key-panel details-panel";
  panel.hidden = true;

  const report = () =>
    onChange({
      title: title.input.value,
      subtitle: subtitle.input.value,
      instructions: instructions.input.value,
    });

  const title = createField(
    {
      label: "Title",
      hint: "Clair de lune",
      max: LIMITS.title.max,
      required: true,
    },
    report,
  );
  const subtitle = createField(
    { label: "Subtitle", hint: "Debussy", max: LIMITS.subtitle.max },
    report,
  );
  const instructions = createField(
    {
      label: "Instructions",
      hint: "Anything worth knowing before playing it.",
      max: LIMITS.instructions.max,
      lines: 4,
    },
    report,
  );

  panel.append(title.row, subtitle.row, instructions.row);

  const disclosure = createDisclosure({
    root: element,
    onChange(open) {
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.classList.toggle("is-on", open);
    },
  });

  toggle.addEventListener("click", () => disclosure.toggle());
  // Escape closes, since a panel of text boxes holds attention in a way the
  // key chooser does not; nothing is lost by closing, because every keystroke
  // has already been reported.
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      disclosure.close();
      toggle.focus();
      event.stopPropagation();
    }
  });

  element.append(toggle, panel);

  return {
    element,
    update(details) {
      title.show(details.title);
      subtitle.show(details.subtitle ?? "");
      instructions.show(details.instructions ?? "");

      const named = details.title.trim() !== "";
      value.textContent = named ? details.title.trim() : "Untitled";
      // Untitled is a fact, not a warning, so it is only greyed — the reason
      // Submit is unavailable is written under Submit.
      value.classList.toggle("is-untitled", !named);
    },
    focusTitle() {
      disclosure.open();
      title.input.focus();
    },
  };
}
