import {
  convertToRestAt,
  divideIntoTuplet,
  pitchNudgeFrom,
  roomAt,
  tieForward,
  undivideTuplet,
  writeAt,
} from "../editor/operations.js";
import { eventPositions } from "../editor/position.js";
import type { Duration } from "../music/duration.js";
import type { KeySignature } from "../music/key-signature.js";
import type { Melody } from "../music/melody.js";
import { Note, Rest, UnpitchedNote } from "../music/note-event.js";
import type { Pitch } from "../music/pitch.js";
import { spellForMelodyEvent, spellMidi, spellingContext } from "../music/spelling.js";
import { createMelodyView, type MelodyView } from "../render/melody-view.js";
import type {
  MelodyRenderResult,
  RenderMelodyOptions,
} from "../render/render-melody.js";
import { createPiano, type Piano } from "../playback/piano.js";
import { createDurationGrid } from "./duration-grid.js";
import { eraserIcon, pianoHeardIcon, restIcon, tieIcon, untieIcon } from "./icons.js";
import { createTupletMenu } from "./tuplet-menu.js";
import { createPianoKeyboard, rangeForClef } from "./piano-keyboard.js";
import { pageTooltip } from "./tooltip.js";
import { isTypingTarget } from "./typing-guard.js";

export type EditorElements = {
  score: HTMLElement;
  /** Sits with the piano: it is a pitch control, not a rhythm one. */
  pitchActions: HTMLElement;
  durations: HTMLElement;
  tuplets: HTMLElement;
  actions: HTMLElement;
  /**
   * The box holding the three groups above.
   *
   * Wanted only so that pitch-only mode can take the whole thing out of the
   * layout rather than leave an empty box in it: emptied but present, it is a
   * flex item of no width that still opens the band's gap and still counts as a
   * sibling, so the video beside it sits off to one side of centre.
   */
  controls?: HTMLElement;
  /**
   * The sheet the score is printed on: the whole scrolling region, not just
   * the score's own box. Pressing anywhere on the paper lets go of the
   * selection, the way pressing the desk beside a page puts your finger down.
   */
  sheet: HTMLElement;
  keyboard: HTMLElement;
};

export type Editor = {
  readonly melody: Melody;
  /** The selected event right now, if one is selected. */
  selection(): number | undefined;
  /** Hold off hover repaints, so an effect over the notes is not cut short. */
  holdStill(ms: number): void;
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
    /**
     * Events whose pitch may not be changed, asked for afresh each time.
     *
     * Empty in the editor, where nothing is settled. On the play page it holds
     * the note the puzzle gave away and every note a check has confirmed: both
     * were found rather than guessed, and losing one to a stray click is a loss
     * no amount of writing over it recovers.
     *
     * Selection is deliberately not affected — a found note can still be
     * clicked, to hear it or to measure the next one against it.
     */
    locked?: () => ReadonlySet<number>;
    /** Verdict colouring, handed straight to the view. */
    decorate?: () => Pick<RenderMelodyOptions, "correct" | "wrong">;
    /**
     * Whether the piano sounds, when the editor is built.
     *
     * Held by the page rather than here, because the editor is torn down and
     * rebuilt for every undo, mode switch and key change, and a setting that
     * lived here would silently switch itself off partway through a session.
     */
    sound?: boolean;
    /** Said whenever the toggle is pressed, so the page can remember it. */
    onSound?: (sounding: boolean) => void;
  } = {},
): Editor {
  const clef = options.clef ?? "treble";
  const pitchOnly = options.pitchOnly ?? false;
  const range = rangeForClef(clef);

  /** The score as it now stands, for putting a refusal on the note it is about. */
  let drawn: MelodyRenderResult | undefined;

  const view: MelodyView = createMelodyView(melody, {
    elementId: elements.score.id,
    clef,
    onRender: (rendered) => {
      drawn = rendered;
      options.onRender?.(rendered);
    },
    decorate: options.decorate,
  });

  /** Whether this event's pitch is settled and not to be written over. */
  const isLocked = (index: number): boolean =>
    options.locked?.().has(index) ?? false;

  /**
   * Where a refused press explains itself.
   *
   * Beside the pointer rather than in a line of its own: the piano is at the
   * bottom of the window and a standing line would be somewhere else, and
   * text appearing there grew whatever band it stood in. What is standing
   * says the standing facts — why Save is grey, what the last check found —
   * which are true whether or not anybody is pointing at anything.
   */
  const tooltip = pageTooltip();

  let explanation: string | undefined;

  /** Name a pitch as the current key would write it. */
  const nameInKey = (midi: number): Pitch =>
    spellMidi(midi, spellingContext(melody.keySignature, []));

  /**
   * Whether a press is heard, and the piano that does the hearing.
   *
   * The piano is built on the first note actually sounded rather than with the
   * editor: it holds an `AudioContext`, and one made outside a gesture arrives
   * suspended.
   */
  let sounding = options.sound ?? false;
  let piano: Piano | undefined;

  /** Sound a pitch, if the toggle is on. */
  function hear(midi: number): void {
    if (!sounding) return;
    piano ??= createPiano();
    piano.play(midi);
  }

  const keyboard = createPianoKeyboard(elements.keyboard, {
    clef,
    spell: nameInKey,
    onExplain: (reason) => {
      explanation = reason;
      showStatus();
    },
    // Every press is heard, whether or not it writes. Writing is `pitchAt`'s
    // business and it declines where it must; being declined is not a reason
    // to have heard nothing.
    onPick: (midi) => {
      hear(midi);
      pitchAt(midi, { heard: true });
    },
  });

  // Whoever is not building these still owns clearing them: pitch-only mode is
  // reached by rebuilding over a page that was writing rhythm a moment ago. The
  // box around them goes too, rather than staying as an empty one — see
  // `EditorElements.controls`.
  if (elements.controls) {
    elements.controls.hidden = pitchOnly;
  }
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

  /**
   * Put a reason beside the pointer, or take it away.
   *
   * The one thing the tooltip is for now: a control that is visibly dead saying
   * why, while it is pointed at. Two controls raise these — the greyed duration
   * cells and the piano when there is nothing to write to — and both are hover,
   * so the pointer is where the answer belongs.
   *
   * There used to be a second kind, raised when an action declined: "select a
   * note first", "that is already a rest". They are gone. A message that
   * appears after a press has already let somebody press a thing that was never
   * going to work, and every one of those cases is a control that could say so
   * beforehand instead — which is what these two now do.
   */
  function showStatus(): void {
    tooltip.say(explanation);
  }

  /**
   * Keep a refused edit for whoever is debugging.
   *
   * Nothing is shown. The operations throw sentences meant to be read, but the
   * controls that can throw are greyed before they are pressed, so anything
   * reaching here is a bug rather than a refusal — and a bug belongs in the
   * console rather than in a tooltip.
   */
  function refuse(error: unknown): void {
    console.error(error);
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
      return;
    }
    let landed: number;
    try {
      landed = edit(anchor);
    } catch (error) {
      refuse(error);
      return;
    }
    refresh(Math.min(landed, melody.eventCount - 1));
  }

  /**
   * Why Tie will not act, or nothing if it will.
   *
   * One line each, and each naming what is in the way rather than restating the
   * rule — the greyed duration cells' wording. The order is the order the
   * reasons are met in: nothing selected, nowhere to tie to, then the four ways
   * two events can fail to be one sound.
   */
  function whyNoTie(): string | undefined {
    const anchor = view.getAnchor();
    if (anchor === undefined) return "Select a note to tie it";
    if (anchor + 1 >= melody.eventCount) return "Nothing after it to tie to";
    // Already tied leaves nothing to do, so the pair reads as one control with
    // two states rather than as two that are both live.
    if (tiedForward()) return "Already tied";

    const here = melody.getEvent(anchor);
    const next = melody.getEvent(anchor + 1);
    if (here instanceof Rest || next instanceof Rest) {
      return "A rest cannot be tied";
    }
    // A tie says two noteheads are one sound, which neither can claim while
    // only one of them has decided what that sound is.
    if (here instanceof Note && !(next instanceof Note)) {
      return "The next note has no pitch yet";
    }
    if (next instanceof Note && !(here instanceof Note)) {
      return "This note has no pitch yet";
    }
    return melody.canTie(anchor) ? undefined : "The next note is a different pitch";
  }

  /** Why Untie will not act, or nothing if it will. */
  function whyNoUntie(): string | undefined {
    if (view.getAnchor() === undefined) return "Select a tied note to untie it";
    return tiedForward() ? undefined : "This note is not tied";
  }

  /** Why Clear pitch will not act, or nothing if it will. */
  function whyNoClear(): string | undefined {
    const anchor = view.getAnchor();
    if (anchor === undefined) return "Select a note to clear it";
    if (melody.getEvent(anchor) instanceof Rest) return "A rest has no pitch";
    if (isLocked(anchor)) return "That note is already found";
    return undefined;
  }

  function syncControls(): void {
    const anchor = view.getAnchor();
    grid?.update(
      anchor === undefined ? undefined : roomAt(melody, anchor),
      anchor === undefined ? undefined : melody.getTupletSpan(anchor).tuplet,
    );
    tuplets?.update(melody, anchor);

    // A tie can only be made where one is possible and only removed where one
    // exists, so both say so before they are pressed rather than after — and
    // now say which of the several reasons it is, while being pointed at.
    grey(tieButton, whyNoTie());
    grey(untieButton, whyNoUntie());
    // Silence is already silence, so there is nothing here to turn into it.
    if (restButton) {
      restButton.disabled =
        anchor === undefined || melody.getEvent(anchor) instanceof Rest;
    }

    // Greyed rather than left to refuse when pressed: on the play page most of
    // the score becomes locked as it is solved, and a control that errors on
    // most of its presses is worse than one that plainly cannot be pressed.
    grey(clearButton, whyNoClear());

    const event = anchor === undefined ? undefined : melody.getEvent(anchor);
    keyboard.highlight(
      event && !(event instanceof Rest) && !(event instanceof UnpitchedNote)
        ? event.pitch.toMidi()
        : undefined,
    );
    // Whether a press would write, and — for a key that will not — the reason,
    // which it says when pointed at. Whether it does anything at all is the
    // sound toggle's business: with the piano on, a key that cannot write can
    // still be listened to, and then it has nothing to explain.
    const stopping =
      anchor === undefined
        ? "Select a note to give it a pitch"
        : event instanceof Rest
          ? "A rest has no pitch"
          : isLocked(anchor)
            ? "That note is already found"
            : undefined;
    keyboard.setWritable(stopping === undefined, stopping);
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
      return;
    }

    const wasRest = melody.getEvent(anchor) instanceof Rest;
    let written: number;
    try {
      written = writeAt(melody, anchor, duration, "note");
    } catch (error) {
      refuse(error);
      return;
    }

    refresh(wasRest ? (after(melody, written) ?? written) : written);
  }

  /**
   * Give the selected note a pitch, spelled to suit the key and the bar.
   *
   * `advance` is what makes the piano one click per note: filling a blank moves
   * on to the next blank, so a whole melody can be pitched without going back
   * to the stave. The arrow keys turn it off — a nudge that moved the selection
   * would mean the second press of Up raised a different note than the first.
   *
   * `heard` says the caller has already sounded this pitch, which the piano's
   * own keys do before they ask for anything to be written. It turns off both
   * the sounding below and the lines of text explaining a refusal: a press that
   * answered with the note it stands for has not gone unanswered, and saying so
   * in words as well would be wrong about what happened.
   */
  function pitchAt(
    midi: number,
    { advance = true, heard = false } = {},
  ): void {
    const anchor = view.getAnchor();
    if (anchor === undefined) {
      return;
    }
    const event = melody.getEvent(anchor);
    if (event instanceof Rest) {
      return;
    }
    if (isLocked(anchor)) {
      return;
    }
    if (midi < range.lowest || midi > range.highest) {
      return;
    }

    const wasUnpitched = event instanceof UnpitchedNote;
    melody.setPitch(anchor, spellForMelodyEvent(melody, anchor, midi));
    // Every way a pitch is set passes through here, so hooking the sound on to
    // it is what makes the arrow keys sound as well as the piano's own.
    if (!heard) hear(midi);

    refresh(
      wasUnpitched && advance
        ? (nextUnpitched(melody, anchor + 1) ?? anchor)
        : anchor,
    );
  }

  /**
   * Move the selected note by a semitone, and say whether anything happened.
   *
   * Where the step counts from is `pitchNudgeFrom`'s business: its own pitch if
   * it has one, otherwise the nearest pitched note before it. The answer is
   * false for a rest and for nothing selected, so the key falls through to the
   * page and still scrolls.
   *
   * A locked note and a pitch outside the clef's range are both refused by
   * `pitchAt`, so neither is checked twice here.
   */
  function nudgePitch(step: 1 | -1): boolean {
    const anchor = view.getAnchor();
    if (anchor === undefined) return false;

    const middle = Math.round((range.lowest + range.highest) / 2);
    const from = pitchNudgeFrom(melody, anchor, middle);
    if (from === undefined) return false;

    pitchAt(from + step, { advance: false });
    return true;
  }

  function clearPitchAt(): void {
    const anchor = view.getAnchor();
    if (anchor === undefined || melody.getEvent(anchor) instanceof Rest) return;
    // The button is greyed and the piano is dead in this case, both of which
    // say so on hover; there is nothing left for a press to explain.
    if (isLocked(anchor)) return;
    melody.clearPitch(anchor);
    refresh(anchor);
  }

  function backspace(): void {
    const anchor = view.getAnchor();
    if (anchor === undefined) {
      return;
    }
    const index = convertToRestAt(melody, anchor);
    refresh(Math.min(index, melody.eventCount - 1));
  }

  /**
   * One rung down: a note loses its pitch, a note without one becomes silence.
   *
   * Backspace takes off the most particular thing the selection still carries,
   * so the same key does the whole ladder — pitched note, then unpitched note,
   * then nothing left to take. Going straight from a written note to a rest
   * would throw away the rhythm as well as the pitch on a single press, and the
   * rhythm is usually the part that was right.
   *
   * The bottom rung differs by mode, because the rhythm is only yours to change
   * in one of them: pitch-only mode stops after the pitch.
   */
  function backspaceLadder(): void {
    const anchor = view.getAnchor();
    if (anchor === undefined) return;
    const event = melody.getEvent(anchor);

    // A pitched note goes through `clearPitchAt`, which is also the only one of
    // the two that refuses a note the puzzle has already found — so the ladder
    // must never let a locked note reach the rung below.
    if (event instanceof Note) {
      clearPitchAt();
      return;
    }
    // The bottom of the ladder, and it says nothing: an unpitched note in
    // pitch-only mode has no rhythm of yours to take away, and a rest has
    // nothing left at all.
    if (pitchOnly || event instanceof Rest) return;
    backspace();
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
      return;
    }
    melody.untie(anchor);
    refresh(anchor);
  }

  function tieSelected(): void {
    const anchor = view.getAnchor();
    if (anchor === undefined || anchor + 1 >= melody.eventCount) {
      return;
    }
    try {
      tieForward(melody, anchor);
    } catch (error) {
      refuse(error);
      return;
    }
    refresh(anchor);
  }

  // ---- action buttons --------------------------------------------------

  /**
   * Why each greyed action is greyed.
   *
   * Only for the ones marked dead rather than disabled. A `disabled` button
   * receives no mouse events at all, so it can be neither pointed at nor asked
   * anything — the same wall the greyed duration cells and the dead piano keys
   * ran into, and the same way round it: `aria-disabled` plus a class, with the
   * press refused in the handler.
   */
  const deadReason = new Map<HTMLButtonElement, string>();

  function grey(
    button: HTMLButtonElement | undefined,
    reason: string | undefined,
  ): void {
    if (!button) return;
    if (reason === undefined) {
      deadReason.delete(button);
    } else {
      deadReason.set(button, reason);
    }
    button.setAttribute("aria-disabled", String(reason !== undefined));
  }

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
    // No `title`. The words are printed under the icon and the key rides its
    // corner, so a tooltip here could only repeat one of the two.
    button.setAttribute("aria-label", label);
    // The key is a sticker on the button's corner — out of the layout, so the
    // button is the same size whether or not the reveal button is showing it.
    const key = printed ? `<kbd class="key-sticker">${printed}</kbd>` : "";
    button.innerHTML = `${key}<span class="action-icon">${icon}</span><span class="action-label">${label}</span>`;
    button.addEventListener("click", () => {
      const dead = deadReason.get(button);
      if (dead === undefined) {
        run();
        return;
      }
      // Pointing at it has said this already; a press says it again rather than
      // answering with nothing at all.
      explanation = dead;
      showStatus();
    });
    // Read on the button rather than the row, since each has its own answer.
    // Silent while the control is live: the words are printed under the icon
    // and the key on its face, so there is nothing left to add.
    button.addEventListener("mousemove", () => {
      explanation = deadReason.get(button);
      showStatus();
    });
    button.addEventListener("mouseleave", () => {
      explanation = undefined;
      showStatus();
    });
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
  // Backspace, because that is the key that does it: taking the pitch off is
  // the first rung of the ladder in `backspaceLadder`, and there is no second
  // key for it.
  const clearButton = actionButton(
    elements.pitchActions,
    eraserIcon(),
    "Clear pitch",
    "Take the pitch off the selection, leaving its rhythm",
    clearPitchAt,
    "\u232B",
  );

  /**
   * Whether the piano sounds as pitches are set.
   *
   * Under the action rather than over it, and drawn as the playback panel's
   * toggles are drawn — an icon that lights when it is on, the keyboard beside
   * a speaker that is sounding or struck through. It is the same kind of thing
   * as "hear the notes" over there, so it is the same kind of control here; as
   * a labelled slider it was the one thing in this band that looked like a
   * setting rather than a switch you flick while playing.
   */
  const soundButton = document.createElement("button");
  soundButton.type = "button";
  soundButton.className = "playback-toggle";
  soundButton.title = "Hear each pitch as it is set";
  soundButton.setAttribute("aria-label", "Hear each pitch as it is set");
  soundButton.setAttribute("aria-pressed", "false");
  soundButton.innerHTML = `<span class="playback-toggle-icon"></span>`;
  soundButton.addEventListener("click", () => {
    sounding = !sounding;
    showSound();
    options.onSound?.(sounding);
  });
  elements.pitchActions.append(soundButton);

  function showSound(): void {
    soundButton.setAttribute("aria-pressed", String(sounding));
    soundButton.classList.toggle("is-on", sounding);
    // The speaker in the icon is the state, so it follows the toggle.
    soundButton.querySelector(".playback-toggle-icon")!.innerHTML =
      pianoHeardIcon(sounding);
    keyboard.setSounding(sounding);
    // Silence means silence: a context left open holds the audio hardware for
    // a page that has said it does not want it.
    if (!sounding) {
      piano?.close();
      piano = undefined;
    }
  }

  showSound();

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
      case "ArrowUp":
      case "ArrowDown":
        // Left and right walk the melody; up and down move the note. Nothing
        // is claimed when there is no pitch to move, so the page still scrolls.
        if (!nudgePitch(event.key === "ArrowUp" ? 1 : -1)) return;
        break;
      case "Backspace":
      case "Delete":
        backspaceLadder();
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
        const digit = /^Digit([1-6])$/.exec(event.code)?.[1];
        if (pitchOnly || !digit || !grid?.press(digit, event.shiftKey)) {
          return;
        }
      }
    }
    // Only once a key has been handled, so the page still scrolls otherwise.
    event.preventDefault();
  }

  view.onSelectionChange((anchor) => {
    syncControls();
    options.onSelect?.(anchor);
    // Useful while working on the editor, not worth a permanent line of the
    // panel: the stave already says where the selection is.
    console.log(describeSelection());
  });
  window.addEventListener("keydown", onKeyDown);

  /**
   * Press the paper anywhere off the music and the selection lets go.
   *
   * The score's own box already does this for a press on empty stave — see
   * `onMouseDown` in melody-view — so presses that land inside it are left to
   * it. What this adds is the rest of the sheet: the title block over the
   * music, and the paper around and below it.
   *
   * On mousedown for the same reason the score uses mousedown: hovering
   * redraws the score, so a `click` is only delivered when down and up land on
   * the same node, and they often do not.
   *
   * On the *capture* phase for a consequence of that same redraw. Bubbling up
   * from the score, this would run after melody-view had already selected the
   * note and redrawn — and the redraw replaces the svg, so by then the pressed
   * node has been thrown away and `contains` says no about a press that was
   * plainly inside the score. Capture runs first, while the tree the press
   * happened in is still standing.
   */
  function onSheetPress(event: MouseEvent): void {
    if (event.target instanceof Node && elements.score.contains(event.target)) {
      return;
    }
    view.select(undefined);
  }
  elements.sheet.addEventListener("mousedown", onSheetPress, true);

  view.select(Math.min(options.initialSelection ?? 0, melody.eventCount - 1));
  syncControls();

  return {
    melody,
    selection: () => view.getAnchor(),
    holdStill: (ms) => view.holdStill(ms),
    destroy() {
      elements.sheet.removeEventListener("mousedown", onSheetPress, true);
      window.removeEventListener("keydown", onKeyDown);
      // Hushed, not destroyed: the tooltip belongs to the page and the controls
      // beside the video go on using it after this editor is gone.
      tooltip.say(undefined);
      piano?.close();
      view.destroy();
    },
  };
}
