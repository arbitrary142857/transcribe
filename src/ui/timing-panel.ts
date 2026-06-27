import type { TimingField, TimingState } from "../playback/timing-fields.js";
import {
  lockClosedIcon,
  lockOpenIcon,
  markEndIcon,
  markStartIcon,
  metronomeIcon,
} from "./icons.js";
import { createSpeedRow } from "./speed-row.js";
import { createTimeField, type TimeField } from "./time-field.js";

/**
 * The timing box on the setup page: two marks, a bar count, and the tempo
 * they imply — with the lock that turns the tempo from a reading into a rule.
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
  metronomeOn: boolean;
  /** Whether the metronome and the lock have a tempo to work with. */
  timed: boolean;
  note: string;
};

export type TimingPanelHandlers = {
  onRate(rate: number): void;
  onMark(field: "start" | "end"): void;
  onType(field: "start" | "end", seconds: number | undefined): void;
  onNudge(field: "start" | "end", seconds: number): void;
  onTypeMeasures(count: number | undefined): void;
  onTypeBpm(bpm: number): void;
  onToggleLock(): void;
  onMetronome(on: boolean): void;
  /** A letter key pressed inside one of the time boxes. */
  onLetter(letter: string, shift: boolean): boolean;
};

export type TimingPanel = {
  update(state: TimingPanelState): void;
  /** Pulse the fields an action rewrote on its own. */
  flash(fields: readonly TimingField[]): void;
};

function labelled(text: string): HTMLElement {
  const label = document.createElement("span");
  label.className = "playback-label";
  label.textContent = text;
  return label;
}

/** An icon button with the key that does the same thing printed on it. */
function markButton(
  icon: string,
  title: string,
  shortcut: string,
  run: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "playback-mark-button";
  button.title = `${title} (${shortcut.toUpperCase()})`;
  button.setAttribute("aria-label", title);
  button.innerHTML = `<kbd class="cell-key">${shortcut.toUpperCase()}</kbd>${icon}`;
  button.addEventListener("click", run);
  return button;
}

export function createTimingPanel(
  element: HTMLElement,
  handlers: TimingPanelHandlers,
): TimingPanel {
  element.replaceChildren();

  const panel = document.createElement("section");
  panel.className = "panel playback-panel timing-panel";

  // ---- speed -----------------------------------------------------------

  const speed = createSpeedRow(handlers.onRate);

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

  const startButton = markButton(
    markStartIcon(),
    "Mark the start of the first bar",
    "i",
    () => handlers.onMark("start"),
  );
  const endButton = markButton(
    markEndIcon(),
    "Mark the end of the last bar",
    "o",
    () => handlers.onMark("end"),
  );

  const startRow = document.createElement("div");
  startRow.className = "playback-mark";
  startRow.append(startButton, startField.element);
  const endRow = document.createElement("div");
  endRow.className = "playback-mark";
  endRow.append(endButton, endField.element);

  // ---- bars ------------------------------------------------------------

  const measuresRow = document.createElement("div");
  measuresRow.className = "timing-measures";
  const measures = document.createElement("input");
  measures.type = "number";
  measures.min = "1";
  measures.max = "999";
  measures.step = "1";
  measures.className = "timing-measures-input";
  measures.placeholder = "—";
  measures.setAttribute("aria-label", "How many bars the marked section is");
  measures.addEventListener("change", () => {
    const value = Number.parseInt(measures.value, 10);
    handlers.onTypeMeasures(
      measures.value.trim() === "" || Number.isNaN(value) ? undefined : value,
    );
  });
  measuresRow.append(labelled("Bars"), measures);

  // ---- tempo -----------------------------------------------------------

  const tempoRow = document.createElement("div");
  tempoRow.className = "timing-tempo";

  const metronome = document.createElement("button");
  metronome.type = "button";
  metronome.className = "playback-toggle timing-metronome";
  metronome.setAttribute("aria-pressed", "false");
  metronome.title = "Click along with the marked tempo";
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

  tempoRow.append(metronome, labelled("BPM"), bpm, lock);

  const note = document.createElement("p");
  note.className = "playback-note";
  note.setAttribute("role", "status");

  panel.append(speed.element, startRow, endRow, measuresRow, tempoRow, note);
  element.append(panel);

  /** Write into a box, unless it is the one being typed in. */
  const showIn = (input: HTMLInputElement, text: string) => {
    if (document.activeElement === input) return;
    input.value = text;
  };

  const flashable: Record<TimingField, HTMLElement> = {
    start: startField.element,
    end: endField.element,
    measures: measuresRow,
    bpm: tempoRow,
  };

  return {
    update(state) {
      speed.update(state.rates, state.rate, state.ready);

      startButton.disabled = !state.ready;
      endButton.disabled = !state.ready;
      // Forced when the value moved under its own power — a mark taken while
      // its box is focused must still land in front of the user.
      startField.show(state.timing.start, true);
      endField.show(state.timing.end, true);
      startField.setDisabled(!state.ready);
      endField.setDisabled(!state.ready);

      showIn(
        measures,
        state.timing.measures === undefined ? "" : String(state.timing.measures),
      );
      // Editable even while locked: a locked bar-count edit moves the end
      // mark, keeping each bar the seconds it had.
      measures.disabled = !state.ready;

      showIn(bpm, state.bpmText ?? "");
      bpm.disabled = !state.ready || state.timing.locked || !state.timed;

      lock.disabled = !state.ready || (!state.timing.locked && !state.timed);
      lock.setAttribute("aria-pressed", String(state.timing.locked));
      lock.classList.toggle("is-on", state.timing.locked);
      lock.innerHTML = state.timing.locked ? lockClosedIcon() : lockOpenIcon();
      lock.title = state.timing.locked
        ? "Unlock the tempo, so the marks move it again"
        : "Lock the tempo, so editing one mark moves the other";

      metronome.disabled = !state.timed;
      metronome.setAttribute("aria-pressed", String(state.metronomeOn));
      metronome.classList.toggle("is-on", state.metronomeOn);

      note.textContent = state.note;
    },

    flash(fields) {
      for (const field of fields) {
        const target = flashable[field];
        target.classList.remove("is-auto-edited");
        void target.offsetWidth;
        target.classList.add("is-auto-edited");
      }
    },
  };
}
