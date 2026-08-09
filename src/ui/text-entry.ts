/**
 * Keeping a text box inside its character limit as it is typed into.
 *
 * There is no `maxlength` here, and that is deliberate rather than an
 * oversight: the attribute counts UTF-16 units while every rule in this
 * codebase counts characters, so `maxlength="128"` would cut a title of family
 * emoji off at sixty-two of them. SQLite's `length()` counts characters and so
 * does `countCharacters`, so the box has to as well or the three disagree.
 *
 * The arithmetic lives here, apart from the DOM, so it can be tested in plain
 * Node with the rest of the suite.
 */

import { countCharacters } from "../shared/transcription.js";

/** A box mid-edit: what it holds, and what is selected in it. */
export type FieldSelection = {
  value: string;
  /** UTF-16 offsets, because that is what `selectionStart` reports. */
  start: number;
  end: number;
};

/**
 * Cut `text` to at most `max` characters without splitting anything visible.
 *
 * Code points are what the limit counts, but they are not what a reader sees:
 * a family emoji is five code points held together by zero-width joiners, and
 * stopping after two of them leaves a lone figure and a dangling joiner on the
 * screen. `Intl.Segmenter` groups code points the way an eye does, so a cut
 * lands between whole characters and the result is only ever shorter than the
 * limit, never broken.
 */
function cutToLength(text: string, max: number): string {
  if (max <= 0) return "";
  if (countCharacters(text) <= max) return text;

  let taken = "";
  let used = 0;
  for (const { segment } of new Intl.Segmenter().segment(text)) {
    const size = countCharacters(segment);
    if (used + size > max) break;
    taken += segment;
    used += size;
  }
  return taken;
}

/**
 * What of `inserting` may actually go in, given where the caret is.
 *
 * An empty answer means nothing happens — the keystroke is simply refused, and
 * a box already at its limit stops accepting rather than accepting and going
 * red. What is selected counts as room reclaimed, since typing over a
 * selection replaces it.
 *
 * A paste too long to fit is cut down rather than turned away whole. Somebody
 * pasting three lines into a field with room for two meant the two, and
 * refusing the lot would leave them to trim it by hand.
 */
export function fitInsertion(
  field: FieldSelection,
  inserting: string,
  max: number,
): string {
  if (inserting === "") return "";

  const replacing = countCharacters(
    field.value.slice(field.start, field.end),
  );
  const room = max - (countCharacters(field.value) - replacing);
  return cutToLength(inserting, room);
}

/**
 * Hold a box to `max()` characters as it is typed into.
 *
 * `beforeinput` rather than `input`: it is the one event that can still say no.
 * Only insertions are examined — deletions, undo and the rest are let by
 * untouched, since none of them can make a field longer.
 *
 * `max` is a function because the caller's limit is read from `LIMITS`, which
 * a test may want to move.
 */
export function limitTyping(
  input: HTMLInputElement | HTMLTextAreaElement,
  max: () => number,
): void {
  input.addEventListener("beforeinput", (event) => {
    // Narrowed rather than cast: `input` is a union of two element types, so
    // addEventListener falls back to its plain-Event overload here.
    if (!(event instanceof InputEvent)) return;

    const inserting = event.data ?? event.dataTransfer?.getData("text") ?? "";
    if (inserting === "") return;

    const field: FieldSelection = {
      value: input.value,
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
    };
    const fitted = fitInsertion(field, inserting, max());
    if (fitted === inserting) return;

    // Whatever the browser was about to do, this does instead: nothing at all
    // when nothing fits, or the part that does.
    event.preventDefault();
    if (fitted === "") return;

    input.setRangeText(fitted, field.start, field.end, "end");
    // setRangeText does not raise `input` by itself, and the counter and the
    // page's copy of the details both listen for it.
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
