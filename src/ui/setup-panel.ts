import type { TimeSignature } from "../music/types.js";
import {
  bpmOf,
  markedField,
  stepTiming,
  timingProblem,
  type TimingAction,
  type TimingState,
} from "../playback/timing-fields.js";
import {
  beatsPerBarOf,
  beatsPerMinute,
  tempoMapOf,
  type Marks,
} from "../playback/tempo-map.js";
import { renderStaveDiagram } from "../render/stave-diagram.js";
import { openModal } from "./modal.js";
import { createTimingPanel, type TimingPanel } from "./timing-panel.js";
import { isTypingTarget } from "./typing-guard.js";
import { mountVideoPanel } from "./video-panel.js";
import { createVideoRig, type VideoRig } from "./video-rig.js";
import { readYouTubeLink } from "./youtube.js";

const CLEFS = ["treble", "bass"] as const;

const METERS: readonly TimeSignature[] = [
  { beats: 4, beatUnit: 4 },
  { beats: 3, beatUnit: 4 },
  { beats: 2, beatUnit: 4 },
  { beats: 6, beatUnit: 8 },
  { beats: 9, beatUnit: 8 },
  { beats: 12, beatUnit: 8 },
  { beats: 5, beatUnit: 8 },
];

const meterLabel = (meter: TimeSignature) => `${meter.beats}/${meter.beatUnit}`;

/**
 * Only as wide as the thing being shown.
 *
 * A stave running on past its clef reads as an empty bar waiting for music; cut
 * back to the glyph it carries, it reads as the clef itself.
 */
const CLEF_WIDTH = 42;
const METER_WIDTH = 40;

/** A clef overhangs the staff; a meter sits inside it. */
const CLEF_HEADROOM = { above: 24, below: 20 };
const METER_HEADROOM = { above: 7, below: 7 };

/**
 * Everything the melody page needs to begin.
 *
 * Three of these are settled for good — the clef, the meter and the bar count,
 * which the music is written against and cannot move under it. The marks are
 * only settled *here*: they were guessed against a video nobody had
 * transcribed yet, and the editor can correct them.
 */
export type Setup = {
  clef: string;
  meter: TimeSignature;
  videoId: string;
  /** Where the first bar starts and the last bar ends, in video seconds. */
  marks: Marks;
  measures: number;
};

export type SetupPageOptions = {
  /** The user confirmed; the setup page has already torn itself down. */
  onStart: (setup: Setup) => void;
};

function cell(
  label: string,
  selected: boolean,
  run: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "setup-cell";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(selected));
  if (selected) {
    button.classList.add("is-on");
  }
  button.addEventListener("click", run);
  return button;
}

/**
 * The felt beats in one bar, or a quarter-note default before a meter is
 * chosen — which is a state only this page has, so the default stays here
 * while the arithmetic lives with the tempo map.
 */
const beatsPerBar = (meter: TimeSignature | undefined): number =>
  meter === undefined ? 4 : beatsPerBarOf(meter);

/**
 * The first page: clef, meter, video, and the timing that pins them together.
 *
 * Split into two kinds of region. The choosers redraw themselves whole on
 * every pick, as the page always has. Everything below them — the link box,
 * the video, the timing panel — is built once and only ever mutated, because
 * a redraw there would take the caret out of a box mid-keystroke, and would
 * reload the video itself: an iframe starts over whenever it is replaced.
 *
 * The clef, the meter and the bar count chosen here are final: the music is
 * written against all three and none can move under it afterwards, so the way
 * out runs through a confirmation that says so. The timing marks are not among
 * them — they are a first guess at a video nobody has transcribed yet, and the
 * editor can correct them.
 */
export function createSetupPage(
  element: HTMLElement,
  { onStart }: SetupPageOptions,
): void {
  element.replaceChildren();

  let clef: string | undefined;
  let meter: TimeSignature | undefined;
  let videoId: string | undefined;
  let rig: VideoRig | undefined;
  let rigReady = false;
  let trouble: string | undefined;
  let timing: TimingState = { locked: false };
  let metronomeOn = false;

  // ---- the choosers, redrawn whole on every pick -------------------------

  const choosers = document.createElement("div");
  choosers.className = "setup-choosers";

  function drawChoosers(): void {
    choosers.replaceChildren();
    const clefs = document.createElement("section");
    clefs.className = "panel setup-panel";
    const clefRow = document.createElement("div");
    clefRow.className = "setup-row";
    clefs.append(clefRow);
    for (const candidate of CLEFS) {
      const button = cell(`${candidate} clef`, clef === candidate, () => {
        clef = candidate;
        drawChoosers();
        refresh();
      });
      const staff = document.createElement("div");
      staff.className = "setup-staff";
      renderStaveDiagram(
        staff,
        CLEF_WIDTH,
        (stave) => stave.addClef(candidate),
        CLEF_HEADROOM,
      );
      button.append(staff);
      clefRow.append(button);
    }

    const meters = document.createElement("section");
    meters.className = "panel setup-panel";
    const meterRow = document.createElement("div");
    meterRow.className = "setup-row";
    meters.append(meterRow);
    for (const candidate of METERS) {
      const selected =
        meter?.beats === candidate.beats &&
        meter?.beatUnit === candidate.beatUnit;
      const button = cell(`${meterLabel(candidate)} time`, selected, () => {
        meter = candidate;
        drawChoosers();
        // The tempo is counted in this meter's beats, so the shown BPM moves
        // even though no mark did.
        panel.flash(["bpm"]);
        refresh();
      });
      const staff = document.createElement("div");
      staff.className = "setup-staff";
      renderStaveDiagram(
        staff,
        METER_WIDTH,
        (stave) => stave.addTimeSignature(meterLabel(candidate)),
        METER_HEADROOM,
      );
      button.append(staff);
      meterRow.append(button);
    }

    choosers.append(clefs, meters);
  }

  // ---- the link box and its Submit --------------------------------------

  const linkPanel = document.createElement("section");
  linkPanel.className = "panel setup-panel setup-link";

  const linkLabel = document.createElement("label");
  linkLabel.className = "setup-link-label";
  linkLabel.htmlFor = "video-link";
  linkLabel.textContent = "YouTube link";

  const linkRow = document.createElement("div");
  linkRow.className = "setup-link-row";

  const linkInput = document.createElement("input");
  linkInput.id = "video-link";
  linkInput.className = "setup-link-input";
  linkInput.type = "url";
  linkInput.inputMode = "url";
  linkInput.autocomplete = "off";
  linkInput.spellcheck = false;
  linkInput.placeholder = "https://www.youtube.com/watch?v=…";

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "setup-link-submit";
  submit.textContent = "Load video";

  const linkNote = document.createElement("p");
  linkNote.className = "setup-link-note";
  linkNote.setAttribute("role", "status");

  linkRow.append(linkInput, submit);
  linkPanel.append(linkLabel, linkRow, linkNote);

  function submitLink(): void {
    const reading = readYouTubeLink(linkInput.value);
    if (reading.videoId === undefined) {
      linkNote.classList.add("is-wrong");
      linkNote.textContent = reading.problem;
      linkInput.setAttribute("aria-invalid", "true");
      return;
    }
    linkNote.classList.remove("is-wrong");
    linkNote.textContent = "";
    linkInput.setAttribute("aria-invalid", "false");
    if (reading.videoId === videoId) {
      return;
    }

    // A different video: whatever was measured was measured against the old
    // one, so the marks go with it.
    rig?.destroy();
    rigReady = false;
    trouble = undefined;
    timing = { locked: false };
    metronomeOn = false;
    videoId = reading.videoId;

    const iframe = mountVideoPanel(videoArea, videoId);
    studio.hidden = false;
    rig = createVideoRig(iframe);
    // The speed can change without this page asking — YouTube's own settings
    // menu — and the readout must follow it either way.
    rig.subscribe({ onRate: () => refresh() });
    rig.ready
      .then(() => {
        rigReady = true;
        refresh();
      })
      .catch((error: unknown) => {
        trouble =
          error instanceof Error
            ? `The video player could not be reached — ${error.message}.`
            : "The video player could not be reached.";
        refresh();
      });
    refresh();
  }

  submit.addEventListener("click", submitLink);
  linkInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitLink();
    }
  });

  // ---- the video and the timing panel, mounted once ----------------------

  const studio = document.createElement("div");
  studio.className = "setup-studio";
  studio.hidden = true;
  const videoArea = document.createElement("div");
  videoArea.id = "setup-video";
  const timingArea = document.createElement("div");
  timingArea.id = "setup-timing";
  studio.append(videoArea, timingArea);

  /** Run one reducer action, flash what it rewrote, and follow through. */
  function act(action: TimingAction): void {
    const step = stepTiming(
      timing,
      action,
      beatsPerBar(meter),
      rig && rig.duration() > 0 ? rig.duration() : undefined,
    );
    timing = step.state;
    if (step.rejected) {
      // Refused, and the state did not move. Nothing is said about it: the
      // panel has no line to say it in, and the box simply shows what it still
      // holds. The Start button below goes on saying what is missing.
      panel.update(panelState());
      return;
    }
    panel.flash([...step.autoEdited, ...markedField(action)]);
    // The metronome clicks the marked tempo, so it follows every change —
    // and falls silent the moment the marks stop describing one.
    if (metronomeOn) {
      const map = currentMap();
      if (map) {
        rig?.setMetronome(map);
      } else {
        metronomeOn = false;
        rig?.setMetronome(undefined);
      }
    }
    refresh();
  }

  const currentMap = () => {
    if (meter === undefined || timing.measures === undefined) return undefined;
    if (timing.start === undefined || timing.end === undefined) return undefined;
    if (timingProblem(timing, beatsPerBar(meter)) !== undefined) {
      return undefined;
    }
    return tempoMapOf(
      { start: timing.start, end: timing.end },
      timing.measures,
      meter,
    );
  };

  const markNow = (field: "start" | "end") => {
    if (!rig || !rigReady) return;
    act({ kind: field === "start" ? "mark-start" : "mark-end", seconds: rig.now() });
  };

  /**
   * The mark keys, from anywhere on the page or inside the time boxes.
   *
   * Shift makes no difference here — this page has no selected-note variant —
   * so a shifted mark is simply a mark.
   */
  const onLetter = (letter: string, _shift: boolean): boolean => {
    if (!rigReady) return false;
    if (letter === "i") {
      markNow("start");
      return true;
    }
    if (letter === "o") {
      markNow("end");
      return true;
    }
    return false;
  };

  const panel: TimingPanel = createTimingPanel(timingArea, {
    onRate: (rate) => rig?.setRate(rate),
    onMark: markNow,
    onType: (field, seconds) =>
      act({ kind: field === "start" ? "type-start" : "type-end", seconds }),
    onNudge: (field, seconds) => act({ kind: "nudge", field, seconds }),
    onTypeMeasures: (count) => act({ kind: "type-measures", count }),
    onTypeBpm: (bpm) => act({ kind: "type-bpm", bpm }),
    onToggleLock: () => act({ kind: "toggle-lock" }),
    onMetronome: (on) => {
      const map = currentMap();
      if (on && map) {
        metronomeOn = true;
        // Inside the click, which is the only place sound may start from.
        rig?.setMetronome(map);
      } else {
        metronomeOn = false;
        rig?.setMetronome(undefined);
      }
      refresh();
    },
    onLetter,
  });

  // ---- the way out -------------------------------------------------------

  const start = document.createElement("button");
  start.type = "button";
  start.className = "setup-submit";
  start.textContent = "Start writing";

  const startNote = document.createElement("p");
  startNote.className = "setup-start-note";
  startNote.setAttribute("role", "status");

  function whatIsMissing(): string | undefined {
    if (!clef || !meter) return "Choose a clef and a meter.";
    if (!videoId) return "Load the video you are writing from.";
    if (trouble) return trouble;
    if (!rigReady) return "Waiting for the video…";
    return timingProblem(timing, beatsPerBar(meter));
  }

  start.addEventListener("click", () => {
    const map = currentMap();
    if (!clef || !meter || !videoId || !map || timing.measures === undefined) {
      return;
    }
    const chosen: Setup = {
      clef,
      meter,
      videoId,
      marks: { start: map.start, end: map.end },
      measures: timing.measures,
    };
    const bars = chosen.measures === 1 ? "1 bar" : `${chosen.measures} bars`;
    void openModal({
      title: "The clef, the meter and the bar count are final",
      body: [
        `${bars} at ${Math.round(beatsPerMinute(map))} BPM, ` +
          `in ${meterLabel(chosen.meter)}, ${chosen.clef} clef.`,
        "Once writing begins, none of those three can be changed. Check them " +
          "against the video before going on.",
        "The timing marks can: correct them from the editor whenever the " +
          "tempo turns out to be a little off.",
      ],
      confirm: "Start writing",
      cancel: "Go back",
    }).then((confirmed) => {
      if (!confirmed) return;
      // The player is let go before its iframe is thrown away, and the page
      // cleans itself up entirely — nothing here survives into the editor.
      window.removeEventListener("keydown", onKey);
      rig?.destroy();
      element.replaceChildren();
      onStart(chosen);
    });
  });

  function onKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event)) return;
    if (onLetter(event.key.toLowerCase(), event.shiftKey)) {
      event.preventDefault();
    }
  }
  window.addEventListener("keydown", onKey);

  // ---- state to screen ---------------------------------------------------

  function panelState() {
    const beats = beatsPerBar(meter);
    const bpm = bpmOf(timing, beats);
    const problem = timingProblem(timing, beats);
    return {
      ready: rigReady,
      rates: rig?.rates() ?? [1],
      rate: rig?.rate() ?? 1,
      timing,
      bpmText:
        bpm === undefined ? undefined : String(Math.round(bpm * 10) / 10),
      metronomeOn,
      timed: meter !== undefined && problem === undefined,
    };
  }

  function refresh(): void {
    panel.update(panelState());
    const missing = whatIsMissing();
    start.disabled = missing !== undefined;
    startNote.textContent = missing ?? "";
  }

  drawChoosers();
  element.append(choosers, linkPanel, studio, start, startNote);
  refresh();
}
