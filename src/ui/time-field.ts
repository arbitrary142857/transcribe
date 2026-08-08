import { formatTimecode, parseTimecode } from "../playback/timecode.js";

/**
 * A box holding a moment of the video, written as a person writes one.
 *
 * The value shown is `2:12.893`; the value handed out is seconds. Typing takes
 * either form — `2:12.893` or `132.893` — and the box settles on the first
 * after each commit. Commits happen on blur and on Enter, never per keystroke:
 * this is a number being composed, and reacting to "1" on the way to "1:30"
 * would be reacting to a time the user never meant. Text the box cannot read
 * is put back the way it was.
 *
 * A native number input cannot hold a colon, so the stepper arrows native
 * inputs get for free are built here instead — and routed out through
 * `onNudge` rather than applied locally, because on the setup page a nudge
 * while the tempo is locked has to move the *other* field too.
 */
export type TimeField = {
  readonly element: HTMLElement;
  /**
   * Show a value. Declined while the user is mid-typing in this box, unless
   * `force` — pressing the mark key must land even with the box focused.
   */
  show(seconds: number | undefined, force?: boolean): void;
  setDisabled(disabled: boolean): void;
  /** The brief pulse marking a value the app rewrote on its own. */
  flash(): void;
};

export type TimeFieldOptions = {
  label: string;
  /** A parsed time was entered; `undefined` means the box was emptied. */
  onCommit(seconds: number | undefined): void;
  /** A stepper press or arrow key; seconds are signed. */
  onNudge(seconds: number): void;
  /**
   * Single letters pressed inside the box. Letters mean nothing in a
   * timecode, so the page may claim them for its mark shortcuts; return true
   * to consume one. Shift is passed along — shifted letters are their own
   * shortcuts.
   */
  onLetter?(letter: string, shift: boolean): boolean;
};

/**
 * One click of the stepper; a finer one with Shift held.
 *
 * A hundredth is comfortably finer than anything being aimed at — a sixteenth
 * note at 120 to the beat lasts 0.125s — and getting somewhere is done by
 * typing or by marking against the video rather than by holding an arrow.
 *
 * A thousandth is the floor and not an arbitrary one: `toMilliseconds` rounds
 * every write to the millisecond and `formatTimecode` shows exactly three
 * decimals, so a finer step would move nothing and read as a broken control.
 */
const STEP_SECONDS = 0.01;
const FINE_STEP_SECONDS = 0.001;

/** Hold-to-repeat, tuned to feel like a native number input. */
const REPEAT_DELAY_MS = 500;
const REPEAT_MS = 100;

export function createTimeField(options: TimeFieldOptions): TimeField {
  const element = document.createElement("div");
  element.className = "time-field";

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "—";
  input.className = "time-field-input";
  input.setAttribute("aria-label", options.label);

  let shown: number | undefined;

  const write = (seconds: number | undefined) => {
    shown = seconds;
    input.value = seconds === undefined ? "" : formatTimecode(seconds);
  };

  function commit(): void {
    const text = input.value.trim();
    if (text === "") {
      options.onCommit(undefined);
      return;
    }
    const parsed = parseTimecode(text);
    if (parsed === undefined) {
      // Not a time: put back what was there, rather than guessing.
      write(shown);
      return;
    }
    options.onCommit(parsed);
  }

  input.addEventListener("change", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commit();
      input.blur();
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const step = event.shiftKey ? FINE_STEP_SECONDS : STEP_SECONDS;
      options.onNudge(event.key === "ArrowUp" ? step : -step);
      event.preventDefault();
      return;
    }
    if (
      options.onLetter &&
      /^[a-z]$/i.test(event.key) &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      options.onLetter(event.key.toLowerCase(), event.shiftKey)
    ) {
      event.preventDefault();
    }
  });

  /** A stepper arrow that fires once, then repeats while held. */
  function stepper(direction: 1 | -1): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.className = "time-field-step";
    button.setAttribute("aria-label", direction > 0 ? "Later" : "Earlier");
    button.innerHTML = direction > 0 ? "&#9652;" : "&#9662;";

    let delay: number | undefined;
    let repeat: number | undefined;
    const fire = (shift: boolean) =>
      options.onNudge(
        direction * (shift ? FINE_STEP_SECONDS : STEP_SECONDS),
      );
    const stop = () => {
      clearTimeout(delay);
      clearInterval(repeat);
    };

    button.addEventListener("pointerdown", (event) => {
      // The box keeps focus and the press is not a form submission.
      event.preventDefault();
      fire(event.shiftKey);
      delay = window.setTimeout(() => {
        repeat = window.setInterval(() => fire(event.shiftKey), REPEAT_MS);
      }, REPEAT_DELAY_MS);
    });
    for (const done of ["pointerup", "pointerleave", "pointercancel"] as const) {
      button.addEventListener(done, stop);
    }
    return button;
  }

  const steps = document.createElement("div");
  steps.className = "time-field-steps";
  steps.append(stepper(1), stepper(-1));

  element.append(input, steps);

  return {
    element,
    show(seconds, force = false) {
      if (!force && document.activeElement === input) return;
      write(seconds);
    },
    setDisabled(disabled) {
      input.disabled = disabled;
      for (const button of steps.querySelectorAll("button")) {
        button.disabled = disabled;
      }
    },
    flash() {
      element.classList.remove("is-auto-edited");
      // Forcing a reflow restarts the animation when two flashes land close.
      void element.offsetWidth;
      element.classList.add("is-auto-edited");
    },
  };
}
