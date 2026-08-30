import {
  MEASURES_MAX,
  type TimingField,
  type TimingState,
} from "../playback/timing-fields.js";
import {
  lockClosedIcon,
  lockOpenIcon,
  markEndIcon,
  markStartIcon,
  metronomeIcon,
} from "./icons.js";
import { createSpeedRow } from "./speed-row.js";
import { createTimeField, type TimeField } from "./time-field.js";
import { createVolumeRow } from "./volume-row.js";

/**
 * The timing box: two marks, the bars between them, and the tempo they imply —
 * with the lock that turns that tempo from a reading into a rule.
 *
 * One shape in both places it stands. On the setup page it is the box the
 * section is marked in; in the editor it is one of the two panels the mode
 * switch trades between, which is why it draws no box of its own and why its
 * rows are named the way the playback panel's are. What differs between the
 * two is in the options below, and it is small: whether the bar count is
 * still being settled, and how the shortcut keys are worn.
 *
 * Built once and mutated. Half of these controls are boxes the user types
 * into, and rebuilding a box between keystrokes takes the caret with it — the
 * same reason the link box above this panel is left alone once made.
 */
export type TimingPanelState = {
  /** The player has answered and can be marked against. */
  ready: boolean;
  rates: readonly number[];
  rate: number;
  timing: TimingState;
  /** The derived tempo, already formatted, or undefined for "—". */
  bpmText: string | undefined;
  /** How loud the video speaks; only where there is a volume row to say it. */
  volume?: number;
  metronomeOn: boolean;
  /** Whether the metronome and the lock have a tempo to work with. */
  timed: boolean;
  /**
   * Whether there is a meter for a tempo to be counted in.
   *
   * Always true in the editor, where the melody has one. On the setup page it
   * is a question, and the tempo box waits on the answer: a tempo typed before
   * a meter is chosen would be read in a guessed four beats to the bar, and
   * the end mark it places would jump the moment the real meter arrived.
   */
  metered: boolean;
};

export type TimingPanelHandlers = {
  onRate(rate: number): void;
  onMark(field: "start" | "end"): void;
  onType(field: "start" | "end", seconds: number | undefined): void;
  onNudge(field: "start" | "end", seconds: number): void;
  onTypeMeasures(count: number | undefined): void;
  onTypeBpm(bpm: number): void;
  onToggleLock(): void;
  /**
   * How loud the video should speak.
   *
   * Only in the editor, where the panel is the way to the player. The setup
   * page shows the embed with its own controls and its own volume button, so
   * a second one there would be two controls for one thing.
   */
  onVolume?(volume: number): void;
  onMetronome(on: boolean): void;
  /** A letter key pressed inside one of the time boxes. */
  onLetter(letter: string, shift: boolean): boolean;
};

export type TimingPanel = {
  update(state: TimingPanelState): void;
  /** Pulse the fields an action rewrote on its own. */
  flash(fields: readonly TimingField[]): void;
};

export type TimingPanelOptions = {
  /**
   * Whether the bar count is one of the things being settled.
   *
   * True on the setup page, where the three fields decide each other. False in
   * the editor, where the bars are the melody's own length and cannot move —
   * so the box is left out entirely rather than shown dead, and the note line
   * underneath goes on reporting the count anyway.
   */
  measures?: "editable" | "fixed";
  /**
   * How the shortcut keys are worn.
   *
   * `held` is the editor's: stickers that appear all at once while K is held,
   * so the controls stand there wearing their icons plainly. `corner` is the
   * setup page's: caps in the top-left corner of each button, always showing
   * and hung outside the corner so that no part of an icon is ever under one.
   * Marking the section is the first thing anybody does on that page, and
   * there is no room there for a shortcut nobody knows about.
   */
  keys?: "held" | "corner";
  /**
   * Whether the speed slider is one of the panel's own rows.
   *
   * `outside` on the setup page, where the slider stands beside the video it
   * slows down rather than under the marks — so the panel is a single band of
   * rows with no rule across it, and the page builds its own `speed-row.ts`
   * and drives it. `rates` and `rate` still arrive in the state; nothing here
   * reads them once the row is somewhere else.
   */
  speed?: "inside" | "outside";
  /**
   * Where the button that acts on a row sits — the mark buttons, and the
   * metronome on the tempo row.
   *
   * `trailing` in the editor, at the far end of the row. This panel shares one
   * box there with the playback panel, which puts its own buttons at the end
   * of the same rows, and the mode switch between them is meant to swap icons
   * rather than layouts.
   *
   * `leading` on the setup page, where the row is this panel's alone: the
   * button follows the word that names it, and the box takes the whole of the
   * rest of the row, including the space the button was holding at the end.
   */
  buttons?: "leading" | "trailing";
};

function labelled(text: string, className = "playback-label"): HTMLElement {
  const label = document.createElement("span");
  label.className = className;
  label.textContent = text;
  return label;
}

/** How long the refusal shake runs; the stylesheet's own figure. */
const REFUSED_MS = 340;

/** A box saying no to what was typed into it — the score's own gesture. */
function refuse(input: HTMLInputElement): void {
  input.classList.remove("is-shaking");
  // Forcing a reflow restarts it when two refusals land close.
  void input.offsetWidth;
  input.classList.add("is-shaking");
  window.setTimeout(() => input.classList.remove("is-shaking"), REFUSED_MS);
}

/** An icon button with the key that does the same thing printed on it. */
function markButton(
  icon: string,
  title: string,
  shortcut: string,
  keyClass: string,
  run: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "playback-mark-button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = `<kbd class="${keyClass}">${shortcut.toUpperCase()}</kbd>${icon}`;
  button.addEventListener("click", run);
  return button;
}

export function createTimingPanel(
  element: HTMLElement,
  handlers: TimingPanelHandlers,
  options: TimingPanelOptions = {},
): TimingPanel {
  element.replaceChildren();
  const editableMeasures = (options.measures ?? "editable") === "editable";

  const panel = document.createElement("section");
  panel.className = "playback-panel timing-panel";

  // ---- speed -----------------------------------------------------------

  const speed =
    (options.speed ?? "inside") === "inside"
      ? createSpeedRow(handlers.onRate)
      : undefined;
  const volume = handlers.onVolume
    ? createVolumeRow(handlers.onVolume)
    : undefined;

  // ---- the two marks ---------------------------------------------------

  const startField = createTimeField({
    label: "Start of the first bar, in seconds",
    onCommit: (seconds) => handlers.onType("start", seconds),
    onNudge: (seconds) => handlers.onNudge("start", seconds),
    onLetter: handlers.onLetter,
  });
  const endField = createTimeField({
    label: "End of the last bar, in seconds",
    onCommit: (seconds) => handlers.onType("end", seconds),
    onNudge: (seconds) => handlers.onNudge("end", seconds),
    onLetter: handlers.onLetter,
  });

  const keyClass =
    (options.keys ?? "held") === "held" ? "key-sticker" : "key-corner";
  const startButton = markButton(
    markStartIcon(),
    "Mark start at the playhead",
    "i",
    keyClass,
    () => handlers.onMark("start"),
  );
  const endButton = markButton(
    markEndIcon(),
    "Mark end at the playhead",
    "o",
    keyClass,
    () => handlers.onMark("end"),
  );

  const leading = (options.buttons ?? "trailing") === "leading";

  const startRow = document.createElement("div");
  startRow.className = "playback-mark";
  const endRow = document.createElement("div");
  endRow.className = "playback-mark";
  // The word, then either the box and the button that writes into it — the
  // playback panel's own row — or the button and then the box, which is the
  // same row with the button brought up beside the word it belongs to.
  startRow.append(
    labelled("Start", "playback-label playback-mark-name"),
    ...(leading
      ? [startButton, startField.element]
      : [startField.element, startButton]),
  );
  endRow.append(
    labelled("End", "playback-label playback-mark-name"),
    ...(leading ? [endButton, endField.element] : [endField.element, endButton]),
  );

  // ---- bars ------------------------------------------------------------

  const measuresRow = document.createElement("div");
  measuresRow.className = "timing-measures";
  const measures = document.createElement("input");
  // Text rather than `number`, which takes a sign, a point and an exponent —
  // none of which a count of bars has — and hands back `NaN` for what somebody
  // plainly typed. What this may hold is decided keystroke by keystroke below
  // instead.
  measures.type = "text";
  measures.inputMode = "numeric";
  measures.autocomplete = "off";
  measures.spellcheck = false;
  measures.maxLength = String(MEASURES_MAX).length;
  measures.className = "timing-measures-input";
  measures.placeholder = "—";
  measures.setAttribute(
    "aria-label",
    `How many bars the marked section is, up to ${MEASURES_MAX}`,
  );

  /**
   * Refuse a keystroke that would make this something other than a bar count.
   *
   * The ceiling is held here rather than answered afterwards: a sentence
   * appearing under the panel to say that 500 is too many is a correction,
   * while the box declining the third digit is an answer — and the row carries
   * the limit in its own label, so nothing about it is a surprise.
   */
  measures.addEventListener("beforeinput", (event) => {
    const typed = (event as InputEvent).data;
    // Deletions and the rest carry no text, and can only make this shorter.
    if (typed === null || typed === undefined) return;
    const from = measures.selectionStart ?? measures.value.length;
    const to = measures.selectionEnd ?? from;
    const next =
      measures.value.slice(0, from) + typed + measures.value.slice(to);
    if (/^\d+$/.test(next) && Number(next) <= MEASURES_MAX) return;
    event.preventDefault();
    refuse(measures);
  });

  measures.addEventListener("change", () => {
    const text = measures.value.trim();
    handlers.onTypeMeasures(text === "" ? undefined : Number(text));
  });

  // The ceiling is part of the word, not an aside beside it: it says what this
  // row asks for, which is a count up to a number.
  const measuresLabel = labelled(
    `Bars (≤ ${MEASURES_MAX})`,
    "playback-label timing-measures-name",
  );
  measuresRow.append(measuresLabel, measures);

  // ---- tempo -----------------------------------------------------------

  const tempoRow = document.createElement("div");
  tempoRow.className = "timing-tempo";

  const metronome = document.createElement("button");
  metronome.type = "button";
  metronome.className = "playback-toggle timing-metronome";
  metronome.setAttribute("aria-pressed", "false");
  metronome.title = "Metronome";
  metronome.innerHTML = `<span class="playback-toggle-icon">${metronomeIcon()}</span>`;
  metronome.addEventListener("click", () => {
    handlers.onMetronome(metronome.getAttribute("aria-pressed") !== "true");
  });

  const bpm = document.createElement("input");
  bpm.type = "number";
  bpm.min = "10";
  bpm.max = "600";
  bpm.step = "0.1";
  bpm.className = "timing-bpm-input";
  bpm.placeholder = "—";
  bpm.setAttribute("aria-label", "Beats per minute");
  bpm.addEventListener("change", () => {
    const value = Number.parseFloat(bpm.value);
    if (Number.isFinite(value)) {
      handlers.onTypeBpm(value);
    }
  });

  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = "timing-lock";
  lock.setAttribute("aria-pressed", "false");
  lock.addEventListener("click", handlers.onToggleLock);

  tempoRow.append(
    ...(leading
      ? [labelled("BPM"), metronome]
      : [metronome, labelled("BPM")]),
    bpm,
    lock,
  );

  // The marks and the tempo they describe, then the speed on its own below —
  // the playback panel's two bands, so the editor's mode switch swaps contents
  // rather than shapes.
  const marks = document.createElement("div");
  marks.className = "playback-section";
  marks.append(
    startRow,
    endRow,
    ...(editableMeasures ? [measuresRow] : []),
    tempoRow,
  );
  panel.append(marks);
  // The second band, and the rule over it, only where there is anything to put
  // in them: with the speed slider elsewhere the panel is one band of marks.
  if (speed || volume) {
    const settings = document.createElement("div");
    settings.className = "playback-section";
    settings.append(
      ...(speed ? [speed.element] : []),
      ...(volume ? [volume.element] : []),
    );
    panel.append(settings);
  }
  element.append(panel);

  /** Write into a box, unless it is the one being typed in. */
  const showIn = (input: HTMLInputElement, text: string) => {
    if (document.activeElement === input) return;
    input.value = text;
  };

  /**
   * How each field says it was written into.
   *
   * The two timecodes hand it to the field itself, which pulses inside its own
   * edge. The other two are rows — a label beside a box — with no face of
   * their own to pulse, so those glow at their bounds instead.
   */
  const pulse = (target: HTMLElement) => {
    target.classList.remove("is-auto-edited");
    // Forcing a reflow restarts the animation when two flashes land close.
    void target.offsetWidth;
    target.classList.add("is-auto-edited");
  };

  /**
   * Whether the box held a tempo as of the last thing this was told.
   *
   * A flash says "this number moved on its own". Where there was no number
   * there is nothing to have moved — choosing a meter before anything has been
   * marked cannot change a tempo that does not exist yet — so the pulse waits
   * until there is one. Read before `update()` runs, which is the order both
   * callers use: flash what the action did, then show the result.
   */
  let hadBpm = false;

  const flashable: Record<TimingField, () => void> = {
    start: () => startField.flash(),
    end: () => endField.flash(),
    measures: () => pulse(measuresRow),
    // On the box itself, as the timecodes pulse on theirs: it is the number
    // that moved, not the word beside it.
    bpm: () => {
      if (hadBpm) pulse(bpm);
    },
  };

  return {
    update(state) {
      speed?.update(state.rates, state.rate, state.ready);
      volume?.update(state.volume ?? 100, state.ready);

      startButton.disabled = !state.ready;
      endButton.disabled = !state.ready;
      // Forced when the value moved under its own power — a mark taken while
      // its box is focused must still land in front of the user.
      startField.show(state.timing.start, true);
      endField.show(state.timing.end, true);
      startField.setDisabled(!state.ready);
      endField.setDisabled(!state.ready);

      if (editableMeasures) {
        showIn(
          measures,
          state.timing.measures === undefined ? "" : String(state.timing.measures),
        );
        // Editable even while locked: a locked bar-count edit moves the end
        // mark, keeping each bar the seconds it had.
        measures.disabled = !state.ready;
      }

      showIn(bpm, state.bpmText ?? "");
      hadBpm = state.bpmText !== undefined;
      // Typeable as soon as there is something for a tempo to act on, which is
      // a start mark and a bar count — not once the marks are already complete
      // and agreed. A tempo typed against those two *places* the end mark, and
      // that is exactly the case where somebody knows the tempo and would
      // rather say it than hunt for the end of the last bar by ear.
      bpm.disabled =
        !state.ready ||
        state.timing.locked ||
        !state.metered ||
        state.timing.start === undefined ||
        state.timing.measures === undefined;

      lock.disabled = !state.ready || (!state.timing.locked && !state.timed);
      lock.setAttribute("aria-pressed", String(state.timing.locked));
      lock.classList.toggle("is-on", state.timing.locked);
      lock.innerHTML = state.timing.locked ? lockClosedIcon() : lockOpenIcon();
      lock.title = state.timing.locked
        ? "Unlock tempo"
        : "Lock tempo";

      metronome.disabled = !state.timed;
      metronome.setAttribute("aria-pressed", String(state.metronomeOn));
      metronome.classList.toggle("is-on", state.metronomeOn);
    },

    flash(fields) {
      for (const field of fields) {
        flashable[field]();
      }
    },
  };
}
