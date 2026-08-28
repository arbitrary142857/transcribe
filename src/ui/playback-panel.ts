import {
  loopIcon,
  metronomeIcon,
  noteEndIcon,
  noteStartIcon,
  notesHeardIcon,
  pauseIcon,
  playheadIcon,
  playIcon,
  restartIcon,
  restoreIcon,
} from "./icons.js";
import { createSpeedRow } from "./speed-row.js";
import { createTimeField, type TimeField } from "./time-field.js";
import { pageTooltip } from "./tooltip.js";
import { createVolumeRow } from "./volume-row.js";

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
 *
 * The panel is two bands of one enclosure — the run (transport and marks),
 * then the settings (speed, volume, the three toggles, what is heard) — with
 * the playback/timing switch riding above both in the shell `playback.ts`
 * builds. It draws no box of its own for that reason.
 */
export type PlaybackPanelState = {
  ready: boolean;
  rates: readonly number[];
  rate: number;
  /** How loud the video speaks, 0 to 100. */
  volume: number;
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
  /** Whether the transcription sounds along with the video. */
  notesOn: boolean;
  followOn: boolean;
  /** Whether the frozen tempo exists — gates metronome and follow. */
  timed: boolean;
};

export type PlaybackPanelHandlers = {
  onRate(rate: number): void;
  onVolume(volume: number): void;
  onPlayPause(): void;
  onLoop(on: boolean): void;
  onRestart(): void;
  onType(field: "start" | "end", seconds: number | undefined): void;
  onNudge(field: "start" | "end", seconds: number): void;
  onFromNote(field: "start" | "end"): void;
  /** Put one mark back to the melody's own start or end. */
  onResetMark(field: "start" | "end"): void;
  onMetronome(on: boolean): void;
  onNotes(on: boolean): void;
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
  // The name only. The key is a sticker over the button, and a tooltip
  // repeating it would be the same fact twice.
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML =
    (shortcut ? `<kbd class="key-sticker">${shortcut}</kbd>` : "") + icon;
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

/** The small uppercase word a row starts with. */
function rowLabel(text: string, className = "playback-label"): HTMLElement {
  const label = document.createElement("span");
  label.className = className;
  label.textContent = text;
  return label;
}

export function createPlaybackPanel(
  element: HTMLElement,
  handlers: PlaybackPanelHandlers,
): PlaybackPanel {
  element.replaceChildren();

  const panel = document.createElement("div");
  panel.className = "playback-panel";

  // ---- the run: transport, then the section it plays -------------------

  const run = document.createElement("div");
  run.className = "playback-section";

  const transport = document.createElement("div");
  transport.className = "playback-transport";

  const play = iconButton(
    "playback-transport-button playback-play",
    playIcon(),
    "Play the section",
    handlers.onPlayPause,
    "␣",
  );
  const restart = iconButton(
    "playback-transport-button",
    restartIcon(),
    "Back to the start of the section",
    handlers.onRestart,
    "R",
  );
  restart.insertAdjacentHTML(
    "beforeend",
    `<span class="playback-transport-label">Restart</span>`,
  );
  transport.append(play, restart);

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
        ? "Start just before the selected note"
        : "End at the selected note",
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
    // Named apart so the stylesheet can give each field the colour of the mark
    // it holds, for the pulse it gives when the button above writes into it.
    row.className = `playback-mark playback-mark-${field}`;
    // The word, the box it names, the button that writes into it, the way
    // back — the same shape the timing panel's rows have, so the two read the
    // same when the switch above them is pressed.
    row.append(
      rowLabel(isStart ? "Start" : "End", "playback-label playback-mark-name"),
      timeField.element,
      fromNote,
      reset,
    );
    return { row, timeField, fromNote, reset };
  }

  const start = sectionRow("start");
  const end = sectionRow("end");

  const marksColumn = document.createElement("div");
  marksColumn.className = "playback-marks";
  marksColumn.append(start.row, end.row);

  run.append(transport, marksColumn);

  // ---- the settings ----------------------------------------------------

  const settings = document.createElement("div");
  settings.className = "playback-section";

  const speed = createSpeedRow(handlers.onRate);

  const volume = createVolumeRow(handlers.onVolume);

  // The four switches for the run about to be made — icons only, the words
  // in their titles. The last one is whether the transcription is heard: its
  // icon carries a speaker that sounds or is struck through, which is the
  // whole of its state.
  const loop = toggle(loopIcon(), "Loop", handlers.onLoop);
  const follow = toggle(playheadIcon(), "Follow along the score", handlers.onFollow);
  const metronome = toggle(metronomeIcon(), "Metronome", handlers.onMetronome);
  const notes = toggle(notesHeardIcon(false), "Hear the notes", handlers.onNotes);

  const toggles = document.createElement("div");
  toggles.className = "playback-toggle-group";
  toggles.append(loop, follow, metronome, notes);

  settings.append(speed.element, volume.element, toggles);

  panel.append(run, settings);
  element.append(panel);

  return {
    update(state) {
      speed.update(state.rates, state.rate, state.ready);

      volume.update(state.volume, state.ready);

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
        `<kbd class="key-sticker">␣</kbd>` +
        (state.playing ? pauseIcon() : playIcon()) +
        `<span class="playback-transport-label">${
          state.playing ? "Pause" : "Play Section"
        }</span>`;
      play.title = state.playing ? "Pause" : "Play the section";
      restart.disabled = !state.canPlay;

      for (const [button, on, gated] of [
        [loop, state.looping, state.timed],
        [metronome, state.metronomeOn, state.timed],
        [follow, state.followOn, state.timed],
        [notes, state.notesOn, state.timed],
      ] as const) {
        button.disabled = !gated;
        button.setAttribute("aria-pressed", String(on));
        button.classList.toggle("is-on", on);
      }
      // The speaker in the icon is the state, so it follows the toggle.
      notes.querySelector(".playback-toggle-icon")!.innerHTML =
        notesHeardIcon(state.notesOn);
    },

    flash(field) {
      (field === "start" ? start : end).timeField.flash();
    },
  };
}
