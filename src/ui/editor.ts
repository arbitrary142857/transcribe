import {
  convertToRestAt,
  divideIntoTuplet,
  roomAt,
  tieForward,
  undivideTuplet,
  writeAt,
} from "../editor/operations.js";
import { eventPositions } from "../editor/position.js";
import type { Duration } from "../music/duration.js";
import type { KeySignature } from "../music/key-signature.js";
import type { Melody } from "../music/melody.js";
import { Rest, UnpitchedNote } from "../music/note-event.js";
import type { Pitch } from "../music/pitch.js";
import { spellForMelodyEvent, spellMidi, spellingContext } from "../music/spelling.js";
import { createMelodyView, type MelodyView } from "../render/melody-view.js";
import type { MelodyRenderResult } from "../render/render-melody.js";
import { createDurationGrid } from "./duration-grid.js";
import { restIcon, tieIcon, unpitchedIcon, untieIcon } from "./icons.js";
import { createTupletMenu } from "./tuplet-menu.js";
import { createPianoKeyboard, rangeForClef } from "./piano-keyboard.js";
import { isTypingTarget } from "./typing-guard.js";

export type EditorElements = {
  score: HTMLElement;
  /** Sits with the piano: it is a pitch control, not a rhythm one. */
  pitchActions: HTMLElement;
  durations: HTMLElement;
  tuplets: HTMLElement;
  actions: HTMLElement;
  status: HTMLElement;
  keyboard: HTMLElement;
};

export type Editor = {
  readonly melody: Melody;
  /** The selected event right now, if one is selected. */
  selection(): number | undefined;
  destroy(): void;
};

/** The event after `index`, if the melody has one. */
const after = (melody: Melody, index: number): number | undefined =>
  index + 1 < melody.eventCount ? index + 1 : undefined;

/** The next note still awaiting a pitch, at or after `from`. */
function nextUnpitched(melody: Melody, from: number): number | undefined {
  for (let i = from; i < melody.eventCount; i++) {
    if (melody.getEvent(i) instanceof UnpitchedNote) {
      return i;
    }
  }
  return undefined;
}

/**
 * Wire a melody up to the controls that edit it.
 *
 * The whole interface turns on one rule: an event is selected, and the controls
 * change it. Nothing is ever inserted, so no bar can end up short or overfull,
 * and every edit can be taken back by writing over it again.
 */
export function createEditor(
  melody: Melody,
  elements: EditorElements,
  options: {
    clef?: string;
    pitchOnly?: boolean;
    /** Called after any edit, so the surrounding controls can catch up. */
    onEdit?: () => void;
    /** Called with each drawing of the score, for anything drawn over it. */
    onRender?: (rendered: MelodyRenderResult) => void;
    /** Called when the selection moves, with the selected event if any. */
    onSelect?: (index: number | undefined) => void;
    /**
     * Where the selection starts out.
     *
     * The editor is torn down and rebuilt for every undo, mode switch and key
     * change, and the person mid-edit has not moved: their selection must not
     * either. An index past the melody's end is clamped by the view.
     */
    initialSelection?: number;
  } = {},
): Editor {
  const clef = options.clef ?? "treble";
  const pitchOnly = options.pitchOnly ?? false;
  const range = rangeForClef(clef);

  const view: MelodyView = createMelodyView(melody, {
    elementId: elements.score.id,
    clef,
    onRender: options.onRender,
  });

  let explanation: string | undefined;

  /** Name a pitch as the current key would write it. */
  const nameInKey = (midi: number): Pitch =>
    spellMidi(midi, spellingContext(melody.keySignature, []));

  const keyboard = createPianoKeyboard(elements.keyboard, {
    clef,
    spell: nameInKey,
    onPick: pitchAt,
  });

  // Whoever is not building these still owns clearing them: pitch-only mode is
  // reached by rebuilding over a page that was writing rhythm a moment ago.
  if (pitchOnly) {
    elements.durations.replaceChildren();
    elements.tuplets.replaceChildren();
  }

  const grid = pitchOnly
    ? undefined
    : createDurationGrid(elements.durations, {
        onPick: writeSelected,
        onExplain: (reason) => {
          explanation = reason;
          showStatus();
        },
      });

  const tuplets = pitchOnly
    ? undefined
    : createTupletMenu(elements.tuplets, {
        onDivide: (tuplet) => runEdit((index) => divideIntoTuplet(melody, index, tuplet)),
        onUndivide: () => runEdit((index) => undivideTuplet(melody, index)),
      });

  // ---- status ----------------------------------------------------------

  function describeSelection(): string {
    const anchor = view.getAnchor();
    if (anchor === undefined) {
      return "Select a note or a rest to change it.";
    }
    const position = eventPositions(melody)[anchor];
    if (!position) {
      return "";
    }
    const beat =
      Math.floor(
        (position.offset.num * melody.timeSignature.beatUnit) /
          position.offset.den,
      ) + 1;
    const remaining = countUnpitched();
    const todo =
      remaining === 0
        ? ""
        : ` · ${remaining} note${remaining === 1 ? "" : "s"} still without a pitch`;
    return `Bar ${position.bar + 1}, beat ${beat}${todo}`;
  }

  function countUnpitched(): number {
    let count = 0;
    for (let i = 0; i < melody.eventCount; i++) {
      if (melody.getEvent(i) instanceof UnpitchedNote) count += 1;
    }
    return count;
  }

  let transient: string | undefined;

  function showStatus(): void {
    elements.status.textContent = explanation ?? transient ?? "";
  }

  function report(message: string | undefined): void {
    transient = message;
    showStatus();
  }

  // ---- editing ---------------------------------------------------------

  function refresh(select?: number): void {
    view.refresh();
    if (select !== undefined) {
      view.select(select);
    }
    syncControls();
    options.onEdit?.();
  }

  /** Run an edit on the selection, reporting anything it refuses to do. */
  function runEdit(edit: (index: number) => number): void {
    const anchor = view.getAnchor();
    if (anchor === undefined) {
      report("Select a note or a rest first.");
      return;
    }
    let landed: number;
    try {
      landed = edit(anchor);
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
      return;
    }
    report(undefined);
    refresh(Math.min(landed, melody.eventCount - 1));
  }

  function syncControls(): void {
    const anchor = view.getAnchor();
    grid?.update(
      anchor === undefined ? undefined : roomAt(melody, anchor),
      anchor === undefined ? undefined : melody.getTupletSpan(anchor).tuplet,
    );
    tuplets?.update(melody, anchor);

    // A tie can only be made where one is possible and only removed where one
    // exists, so both say so before they are pressed rather than after.
    if (tieButton) {
      // Already tied leaves nothing to do, so the pair reads as one control
      // with two states rather than as two that are both live.
      tieButton.disabled =
        anchor === undefined || !melody.canTie(anchor) || tiedForward();
    }
    if (untieButton) {
      untieButton.disabled = !tiedForward();
    }
    // Silence is already silence, so there is nothing here to turn into it.
    if (restButton) {
      restButton.disabled =
        anchor === undefined || melody.getEvent(anchor) instanceof Rest;
    }

    const event = anchor === undefined ? undefined : melody.getEvent(anchor);
    keyboard.highlight(
      event && !(event instanceof Rest) && !(event instanceof UnpitchedNote)
        ? event.pitch.toMidi()
        : undefined,
    );
    showStatus();
  }

  /**
   * Write a duration over the selection.
   *
   * The selection moves on only when a rest was written over — that is writing
   * new music, and moving on is what makes a rhythm one click per note. Changing
   * a note already written is revising, so the selection stays put and can be
   * adjusted again.
   */
  function writeSelected(duration: Duration): void {
    const anchor = view.getAnchor();
    if (anchor === undefined) {
      report("Select a note or a rest first.");
      return;
    }

    const wasRest = melody.getEvent(anchor) instanceof Rest;
    let written: number;
    try {
      written = writeAt(melody, anchor, duration, "note");
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
      return;
    }

    report(undefined);
    refresh(wasRest ? (after(melody, written) ?? written) : written);
  }

  /** Give the selected note a pitch, spelled to suit the key and the bar. */
  function pitchAt(midi: number): void {
    const anchor = view.getAnchor();
    if (anchor === undefined) {
      report("Select a note first.");
      return;
    }
    const event = melody.getEvent(anchor);
    if (event instanceof Rest) {
      report("A rest has no pitch — write a duration over it to make it a note.");
      return;
    }
    if (midi < range.lowest || midi > range.highest) {
      return;
    }

    const wasUnpitched = event instanceof UnpitchedNote;
    melody.setPitch(anchor, spellForMelodyEvent(melody, anchor, midi));

    report(undefined);
    // Filling in a pitch moves on to the next note still missing one, so a whole
    // melody can be pitched without ever going back to the stave.
    refresh(
      wasUnpitched ? (nextUnpitched(melody, anchor + 1) ?? anchor) : anchor,
    );
  }

  function clearPitchAt(): void {
    const anchor = view.getAnchor();
    if (anchor === undefined || melody.getEvent(anchor) instanceof Rest) {
      report("Select a note to take its pitch off.");
      return;
    }
    melody.clearPitch(anchor);
    report(undefined);
    refresh(anchor);
  }

  function backspace(): void {
    const anchor = view.getAnchor();
    if (anchor === undefined) {
      report("Select a note to turn it into a rest.");
      return;
    }
    const index = convertToRestAt(melody, anchor);
    report(undefined);
    refresh(Math.min(index, melody.eventCount - 1));
  }

  /** Whether the selection is already tied to the event after it. */
  function tiedForward(): boolean {
    const anchor = view.getAnchor();
    return (
      anchor !== undefined &&
      anchor < melody.eventCount - 1 &&
      melody.isTiedToNext(anchor)
    );
  }

  function untieSelected(): void {
    const anchor = view.getAnchor();
    if (anchor === undefined || !tiedForward()) {
      report("Select a note that is tied to the one after it.");
      return;
    }
    melody.untie(anchor);
    report(undefined);
    refresh(anchor);
  }

  function tieSelected(): void {
    const anchor = view.getAnchor();
    if (anchor === undefined || anchor + 1 >= melody.eventCount) {
      report("Select a note to tie it to the one after it.");
      return;
    }
    try {
      tieForward(melody, anchor);
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
      return;
    }
    report(undefined);
    refresh(anchor);
  }

  // ---- action buttons --------------------------------------------------

  /** An action drawn as what it does, with the words underneath. */
  function actionButton(
    into: HTMLElement,
    icon: string,
    label: string,
    title: string,
    run: () => void,
    shortcut?: string,
  ) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action";
    const printed = shortcut && shortcut.length === 1 && /[a-z]/i.test(shortcut)
      ? shortcut.toUpperCase()
      : shortcut;
    button.title = printed ? `${title} (${printed})` : title;
    button.setAttribute("aria-label", label);
    // The key is printed on the control rather than hidden in a tooltip, which
    // is the only way anybody finds out a shortcut exists.
    const key = `<kbd class="action-key">${printed ?? ""}</kbd>`;
    button.innerHTML = `${key}<span class="action-icon">${icon}</span><span class="action-label">${label}</span>`;
    button.addEventListener("click", run);
    into.append(button);
    return button;
  }

  elements.actions.replaceChildren();
  elements.pitchActions.replaceChildren();
  let tieButton: HTMLButtonElement | undefined;
  let untieButton: HTMLButtonElement | undefined;
  let restButton: HTMLButtonElement | undefined;
  if (!pitchOnly) {
    tieButton = actionButton(
      elements.actions,
      tieIcon(),
      "Tie to next",
      "Tie the selection to the note after it",
      tieSelected,
      "t",
    );
    untieButton = actionButton(
      elements.actions,
      untieIcon(),
      "Untie from next",
      "Remove the tie between the selection and the note after it",
      untieSelected,
      "u",
    );
    restButton = actionButton(
      elements.actions,
      restIcon(),
      "Turn to rest",
      "Turn the selection into a rest of the same length",
      backspace,
      "\u232B",
    );
  }
  actionButton(
    elements.pitchActions,
    unpitchedIcon(),
    "Clear pitch",
    "Take the pitch off the selection, leaving its rhythm",
    clearPitchAt,
  );

  // ---- keyboard --------------------------------------------------------

  function onKeyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    // A digit typed into a timestamp box is a digit, not a duration.
    if (isTypingTarget(event)) {
      return;
    }
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        view.moveSelection(event.key === "ArrowRight" ? 1 : -1);
        break;
      case "Backspace":
      case "Delete":
        if (pitchOnly) return;
        backspace();
        break;
      case "t":
      case "T":
        if (pitchOnly) return;
        tieSelected();
        break;
      case "u":
      case "U":
        if (pitchOnly) return;
        untieSelected();
        break;
      default: {
        // A digit writes the length it is printed on — the dotted one with
        // Shift held — when that length fits. Matched on the physical key,
        // because Shift+1 types "!" and the shortcut must not care.
        const digit = /^Digit([1-5])$/.exec(event.code)?.[1];
        if (pitchOnly || !digit || !grid?.press(digit, event.shiftKey)) {
          return;
        }
      }
    }
    // Only once a key has been handled, so the page still scrolls otherwise.
    event.preventDefault();
  }

  view.onSelectionChange((anchor) => {
    report(undefined);
    syncControls();
    options.onSelect?.(anchor);
    // Useful while working on the editor, not worth a permanent line of the
    // panel: the stave already says where the selection is.
    console.log(describeSelection());
  });
  window.addEventListener("keydown", onKeyDown);

  view.select(Math.min(options.initialSelection ?? 0, melody.eventCount - 1));
  syncControls();

  return {
    melody,
    selection: () => view.getAnchor(),
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      view.destroy();
    },
  };
}
