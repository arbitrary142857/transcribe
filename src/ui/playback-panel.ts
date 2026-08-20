import {
  jumpBackIcon,
  loopIcon,
  metronomeIcon,
  noteEndIcon,
  noteStartIcon,
  pauseIcon,
  playheadIcon,
  playIcon,
  restoreIcon,
} from "./icons.js";
import { createSpeedRow } from "./speed-row.js";
import { createTimeField, type TimeField } from "./time-field.js";
import { pageTooltip } from "./tooltip.js";

/**
 * The melody page's playback controls.
 *
 * The song's own timing was settled on the setup page and cannot be touched
 * here; what these controls hold is the *section* — the stretch of the video
 * being worked on right now — and the transport that plays just that stretch.
 *
 * Built once and mutated, never rebuilt: the section fields are boxes the
 * user types into, and rebuilding one between keystrokes takes the caret
 * with it.
 */
import type { Hearing } from "../playback/playalong.js";
import { createHearingSwitch } from "./hearing-switch.js";

export type PlaybackPanelState = {
  ready: boolean;
  rates: readonly number[];
  rate: number;
  /** The section being played, in video seconds. */
  start: number | undefined;
  end: number | undefined;
  /** Whether the video is playing — however it was started. */
  playing: boolean;
  looping: boolean;
  /** Whether the transport can act at all: the rig answered, a tempo exists. */
  canPlay: boolean;
  /** Whether a note is selected, for the set-from-note buttons. */
  hasSelection: boolean;
  metronomeOn: boolean;
  /** What the section is heard as. */
  hearing: Hearing;
  followOn: boolean;
  /** Whether the frozen tempo exists — gates metronome and follow. */
  timed: boolean;
};

export type PlaybackPanelHandlers = {
  onRate(rate: number): void;
  onPlayPause(): void;
  onLoop(on: boolean): void;
  onJumpBack(): void;
  onType(field: "start" | "end", seconds: number | undefined): void;
  onNudge(field: "start" | "end", seconds: number): void;
  onFromNote(field: "start" | "end"): void;
  /** Put one mark back to the melody's own start or end. */
  onResetMark(field: "start" | "end"): void;
  onMetronome(on: boolean): void;
  onHearing(hearing: Hearing): void;
  onFollow(on: boolean): void;
  /** A letter pressed inside a section field; shift distinguishes variants. */
  onLetter(letter: string, shift: boolean): boolean;
};

export type PlaybackPanel = {
  update(state: PlaybackPanelState): void;
  /**
   * Say that a mark was moved by something other than typing into it.
   *
   * A press of `I`, or the button beside the box, or the reset — anything that
   * writes a timestamp the user was not looking at the caret in. The same pulse
   * the setup page uses when the tempo moves a mark on its own, so the two
   * mean the same thing wherever they appear.
   */
  flash(field: "start" | "end"): void;
};

/**
 * Why a greyed button is greyed, for the ones greyed rather than disabled.
 *
 * Only the set-from-the-selected-note pair is in here. A `disabled` button
 * receives no mouse events at all and so cannot be pointed at, which is fine
 * for a transport that is plainly waiting on the video and no use for a button
 * whose face says nothing about wanting a note selected first.
 */
const deadReason = new WeakMap<HTMLButtonElement, string>();

function grey(button: HTMLButtonElement, reason: string | undefined): void {
  if (reason === undefined) {
    deadReason.delete(button);
  } else {
    deadReason.set(button, reason);
  }
  button.setAttribute("aria-disabled", String(reason !== undefined));
}

function iconButton(
  className: string,
  icon: string,
  title: string,
  run: () => void,
  shortcut?: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  // The name only. The key is printed on the button in a `<kbd>`, and a
  // tooltip repeating it would be the same fact twice.
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML =
    (shortcut ? `<kbd class="cell-key">${shortcut}</kbd>` : "") + icon;
  button.addEventListener("click", () => {
    const dead = deadReason.get(button);
    if (dead === undefined) {
      run();
      return;
    }
    pageTooltip().say(dead);
  });
  // Nothing to say while it is live: the OS tooltip carries the name, and this
  // one is for the reason a control cannot be used.
  button.addEventListener("mousemove", () => {
    const dead = deadReason.get(button);
    if (dead !== undefined) pageTooltip().say(dead);
  });
  button.addEventListener("mouseleave", () => pageTooltip().say(undefined));
  return button;
}

/** A toggle that is all icon: the picture is the label, the title the words. */
function toggle(
  icon: string,
  label: string,
  onPress: (on: boolean) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "playback-toggle";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", "false");
  button.innerHTML = `<span class="playback-toggle-icon">${icon}</span>`;
  button.addEventListener("click", () => {
    onPress(button.getAttribute("aria-pressed") !== "true");
  });
  return button;
}

export function createPlaybackPanel(
  element: HTMLElement,
  handlers: PlaybackPanelHandlers,
): PlaybackPanel {
  element.replaceChildren();

  const panel = document.createElement("section");
  panel.className = "panel playback-panel";

  const speed = createSpeedRow(handlers.onRate);

  // ---- the section -----------------------------------------------------

  function sectionRow(field: "start" | "end"): {
    row: HTMLElement;
    timeField: TimeField;
    fromNote: HTMLButtonElement;
    reset: HTMLButtonElement;
  } {
    const isStart = field === "start";
    const timeField = createTimeField({
      label: isStart
        ? "Start of playback, in seconds"
        : "End of playback, in seconds",
      onCommit: (seconds) => handlers.onType(field, seconds),
      onNudge: (seconds) => handlers.onNudge(field, seconds),
      onLetter: handlers.onLetter,
    });
    // The section is marked off the *score*, not off the clock. Taking a mark
    // from where the video happens to be standing was a second way to do the
    // same thing, worse at it — the loop you want is almost always a phrase you
    // can see, and its ends are the onsets the tempo already knows to the
    // millisecond, not wherever a scrubbed playhead came to rest.
    const fromNote = iconButton(
      "playback-mark-button",
      isStart ? noteStartIcon() : noteEndIcon(),
      isStart
        ? "Start at note"
        : "End at note",
      () => handlers.onFromNote(field),
      isStart ? "I" : "O",
    );
    const reset = iconButton(
      "playback-mark-button playback-mark-reset",
      restoreIcon(),
      isStart
        ? "Reset start"
        : "Reset end",
      () => handlers.onResetMark(field),
    );
    const row = document.createElement("div");
    row.className = "playback-mark";
    // Button, then the box it writes into, then the way back — the shape the
    // setup page's timing rows already have, so the two panels read the same
    // and the key stays printed on the corner of the same leading button.
    row.append(fromNote, timeField.element, reset);
    return { row, timeField, fromNote, reset };
  }

  const start = sectionRow("start");
  const end = sectionRow("end");

  const marksColumn = document.createElement("div");
  marksColumn.className = "playback-marks";
  marksColumn.append(start.row, end.row);

  // ---- transport -------------------------------------------------------

  const transport = document.createElement("div");
  transport.className = "playback-transport";

  const play = iconButton(
    "playback-transport-button playback-play",
    playIcon(),
    "Play",
    handlers.onPlayPause,
    "␣",
  );
  const jumpBack = iconButton(
    "playback-transport-button",
    jumpBackIcon(),
    "Back to start",
    handlers.onJumpBack,
    "R",
  );
  const loop = iconButton(
    "playback-transport-button",
    loopIcon(),
    "Loop",
    () => handlers.onLoop(loop.getAttribute("aria-pressed") !== "true"),
  );
  loop.setAttribute("aria-pressed", "false");

  // The toggles sit in the transport row, the same size as its buttons: one
  // row of controls rather than two families of different shapes.
  const metronome = toggle(metronomeIcon(), "Metronome", handlers.onMetronome);
  const follow = toggle(
    playheadIcon(),
    "Follow",
    handlers.onFollow,
  );

  const more = document.createElement("button");
  more.type = "button";
  more.className = "playback-more";
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-label", "Show speed and playback marks");
  more.innerHTML = `<span aria-hidden="true">⌄</span>`;
  more.addEventListener("click", () => {
    const open = panel.classList.toggle("is-open");
    more.setAttribute("aria-expanded", String(open));
  });

  transport.append(play, jumpBack, loop, metronome, follow, more);

  const hearing = createHearingSwitch(handlers.onHearing);

  // The speed, what is heard and the section fields fold away on a narrow
  // screen; the transport stays out, being what is reached for mid-take.
  const extra = document.createElement("div");
  extra.className = "playback-extra";
  extra.append(speed.element, hearing.element, marksColumn);

  panel.append(extra, transport);
  element.append(panel);

  return {
    update(state) {
      speed.update(state.rates, state.rate, state.ready);

      for (const [row, seconds] of [
        [start, state.start],
        [end, state.end],
      ] as const) {
        row.timeField.show(seconds, true);
        row.timeField.setDisabled(!state.ready);
        // Greyed rather than disabled, so it can be asked what it is waiting
        // for — and it is the only way to set the mark now, so being unable to
        // say why would leave the row with nothing working and nothing said.
        // Waiting on a selection is a fact about the score across the page,
        // which the button's own face has no way of carrying.
        grey(
          row.fromNote,
          !state.ready
            ? "The video is still loading"
            : state.hasSelection
              ? undefined
              : "Select a note first",
        );
        row.reset.disabled = !state.ready || !state.timed;
      }

      play.disabled = !state.canPlay;
      play.innerHTML =
        `<kbd class="cell-key">␣</kbd>` +
        (state.playing ? pauseIcon() : playIcon());
      play.title = state.playing ? "Pause" : "Play";
      jumpBack.disabled = !state.canPlay;

      loop.disabled = !state.timed;
      loop.setAttribute("aria-pressed", String(state.looping));
      loop.classList.toggle("is-on", state.looping);

      hearing.update(state.hearing, state.timed);

      for (const [button, on, gated] of [
        [metronome, state.metronomeOn, state.timed],
        [follow, state.followOn, state.timed],
      ] as const) {
        button.disabled = !gated;
        button.setAttribute("aria-pressed", String(on));
        button.classList.toggle("is-on", on);
      }
    },

    flash(field) {
      (field === "start" ? start : end).timeField.flash();
    },
  };
}
