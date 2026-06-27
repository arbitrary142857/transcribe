import {
  jumpBackIcon,
  loopIcon,
  markEndIcon,
  markStartIcon,
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
  followOn: boolean;
  /** Whether the frozen tempo exists — gates metronome and follow. */
  timed: boolean;
  note: string;
};

export type PlaybackPanelHandlers = {
  onRate(rate: number): void;
  onPlayPause(): void;
  onLoop(on: boolean): void;
  onJumpBack(): void;
  onMark(field: "start" | "end"): void;
  onType(field: "start" | "end", seconds: number | undefined): void;
  onNudge(field: "start" | "end", seconds: number): void;
  onFromNote(field: "start" | "end"): void;
  /** Put one mark back to the melody's own start or end. */
  onResetMark(field: "start" | "end"): void;
  onMetronome(on: boolean): void;
  onFollow(on: boolean): void;
  /** A letter pressed inside a section field; shift distinguishes variants. */
  onLetter(letter: string, shift: boolean): boolean;
};

export type PlaybackPanel = { update(state: PlaybackPanelState): void };

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
  button.title = shortcut ? `${title} (${shortcut})` : title;
  button.setAttribute("aria-label", title);
  button.innerHTML =
    (shortcut ? `<kbd class="cell-key">${shortcut}</kbd>` : "") + icon;
  button.addEventListener("click", run);
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
    mark: HTMLButtonElement;
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
    const mark = iconButton(
      "playback-mark-button",
      isStart ? markStartIcon() : markEndIcon(),
      isStart
        ? "Set the start of playback to now"
        : "Set the end of playback to now",
      () => handlers.onMark(field),
      isStart ? "I" : "O",
    );
    const fromNote = iconButton(
      "playback-mark-button",
      isStart ? noteStartIcon() : noteEndIcon(),
      isStart
        ? "Set the start of playback to the selected note"
        : "Set the end of playback to the end of the selected note",
      () => handlers.onFromNote(field),
      isStart ? "⇧I" : "⇧O",
    );
    const reset = iconButton(
      "playback-mark-button playback-mark-reset",
      restoreIcon(),
      isStart
        ? "Put the start of playback back to the melody's start"
        : "Put the end of playback back to the melody's end",
      () => handlers.onResetMark(field),
    );
    const row = document.createElement("div");
    row.className = "playback-mark";
    row.append(mark, timeField.element, fromNote, reset);
    return { row, timeField, mark, fromNote, reset };
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
    "Play the marked section",
    handlers.onPlayPause,
    "␣",
  );
  const jumpBack = iconButton(
    "playback-transport-button",
    jumpBackIcon(),
    "Back to the start of playback",
    handlers.onJumpBack,
    "R",
  );
  const loop = iconButton(
    "playback-transport-button",
    loopIcon(),
    "Loop the marked section",
    () => handlers.onLoop(loop.getAttribute("aria-pressed") !== "true"),
  );
  loop.setAttribute("aria-pressed", "false");

  // The toggles sit in the transport row, the same size as its buttons: one
  // row of controls rather than two families of different shapes.
  const metronome = toggle(metronomeIcon(), "Metronome", handlers.onMetronome);
  const follow = toggle(
    playheadIcon(),
    "Follow the music on the stave",
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

  // The speed and the section fields fold away on a narrow screen; the
  // transport stays out, being what is reached for mid-take.
  const extra = document.createElement("div");
  extra.className = "playback-extra";
  extra.append(speed.element, marksColumn);

  const note = document.createElement("p");
  note.className = "playback-note";
  note.setAttribute("role", "status");

  panel.append(extra, transport, note);
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
        row.mark.disabled = !state.ready;
        row.fromNote.disabled = !state.ready || !state.hasSelection;
        row.reset.disabled = !state.ready || !state.timed;
      }

      play.disabled = !state.canPlay;
      play.innerHTML =
        `<kbd class="cell-key">␣</kbd>` +
        (state.playing ? pauseIcon() : playIcon());
      play.title = state.playing
        ? "Pause the section (␣)"
        : "Play the marked section (␣)";
      jumpBack.disabled = !state.canPlay;

      loop.disabled = !state.timed;
      loop.setAttribute("aria-pressed", String(state.looping));
      loop.classList.toggle("is-on", state.looping);

      for (const [button, on, gated] of [
        [metronome, state.metronomeOn, state.timed],
        [follow, state.followOn, state.timed],
      ] as const) {
        button.disabled = !gated;
        button.setAttribute("aria-pressed", String(on));
        button.classList.toggle("is-on", on);
      }

      note.textContent = state.note;
    },
  };
}
