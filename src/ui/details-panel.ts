/**
 * What the transcription is called, and what its author wants said about it.
 *
 * Reachable while the music is being written rather than kept for a step on
 * the way out, because a title is not something you decide at the end: the
 * piece has a name before the first note is written down. Nothing here is a
 * submission — it is simply the state of the thing being edited, and Save
 * sends whatever is in it. Which is why the box these fill has no OK: every
 * keystroke has already been reported by the time it is closed.
 *
 * The fields are made fresh each time the box opens, and that is safe for the
 * same reason: nothing lives in them that is not already held outside them.
 * Within one opening they are never rebuilt, because rebuilding a box between
 * two keystrokes takes the caret with it.
 */

import {
  countCharacters,
  LIMITS,
  type TranscriptionDetails,
} from "../shared/transcription.js";
import { createDifficultyPicker, type DifficultyPicker } from "./difficulty-picker.js";
import { limitTyping } from "./text-entry.js";

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
 * Exported because the published-level box wants the very same three boxes as
 * the editor's: same limit, same counter, same required mark.
 */
export function createField(options: FieldOptions, onInput: () => void): Field {
  const row = document.createElement("div");
  row.className = "details-field";

  const label = document.createElement("label");
  label.className = "setup-link-label details-label";
  label.textContent = options.label;
  if (options.required) {
    // Said in words rather than a star — a star is a footnote mark until the
    // reader already knows the convention — in the same red the app uses for
    // the note under the cursor, and hidden from a screen reader, which is
    // told by aria-required instead.
    const mark = document.createElement("span");
    mark.className = "details-required";
    mark.textContent = "(Required)";
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

  // Numbered as well as named: two boxes of these can stand on one page at
  // once, and a label pointing at the wrong box is worse than no label.
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

/**
 * The difficulty, as a row of the details like the three text boxes: the
 * same label style, and the pepper picker where a box would be.
 *
 * Exported for the details modal, which wants the same row. Nothing here is
 * sent by pressing a pepper: like the three boxes above it, this row is state
 * being edited, and Save is what reaches the database.
 */
export function difficultyRow(
  value: number | undefined,
  onChange: (value: number | undefined) => void,
  /**
   * Whether this row may be left empty — false only for a published tune,
   * which must keep a difficulty, and where the × would offer a save the
   * server refuses.
   */
  clearable = true,
): HTMLElement & { picker: DifficultyPicker } {
  const row = document.createElement("div") as HTMLDivElement & { picker: DifficultyPicker };
  row.className = "details-field details-difficulty";

  const label = document.createElement("span");
  label.className = "setup-link-label details-label";
  label.textContent = "Difficulty";

  const head = document.createElement("div");
  head.className = "details-head";
  head.append(label);

  const picker = createDifficultyPicker({ value, onChange, clearable });
  row.append(head, picker.element);
  row.picker = picker;
  return row;
}

/**
 * The rows the details box holds, and a way to put fresh values in them.
 *
 * The caller owns the box; this owns what goes in it. `update` exists for the
 * live editor, where the melody's details can change under an open box — an
 * undo does not touch them, but a restore does — and it declines to write over
 * whichever field the caret is in, as `createField` already does.
 */
export type DetailsFields = {
  readonly rows: readonly HTMLElement[];
  update(details: TranscriptionDetails): void;
  /** Put the caret in the title, for a box opened in order to name something. */
  focusTitle(): void;
};

export function createDetailsFields(
  onChange: (details: TranscriptionDetails) => void,
): DetailsFields {
  let difficulty: number | undefined;
  const report = () =>
    onChange({
      title: title.input.value,
      subtitle: subtitle.input.value,
      instructions: instructions.input.value,
      difficulty,
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

  const stars = difficultyRow(undefined, (next) => {
    difficulty = next;
    report();
  });

  return {
    rows: [title.row, subtitle.row, instructions.row, stars],
    update(details) {
      title.show(details.title);
      subtitle.show(details.subtitle ?? "");
      instructions.show(details.instructions ?? "");
      difficulty = details.difficulty;
      stars.picker.set(difficulty);
    },
    focusTitle() {
      title.input.focus();
    },
  };
}
