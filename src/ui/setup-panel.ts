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
  tempoMapOf,
  type Marks,
} from "../playback/tempo-map.js";
import { renderStaveDiagram } from "../render/stave-diagram.js";
import { createMeterField, type MeterField } from "./meter-field.js";
import { marked, openModal } from "./modal.js";
import { createSpeedRow } from "./speed-row.js";
import { createTimingPanel, type TimingPanel } from "./timing-panel.js";
import { pageTooltip } from "./tooltip.js";
import { isTypingTarget } from "./typing-guard.js";
import { mountVideoPanel } from "./video-panel.js";
import { createVideoRig, type VideoRig } from "./video-rig.js";
import { readYouTubeLink } from "./youtube.js";

const CLEFS = ["treble", "bass"] as const;

/**
 * The meters worth a button of their own.
 *
 * Not the meters that can be written: the boxes underneath take any count from
 * 1 to 31 over any note value anybody counts in, and 5/8 and 7/8 are typed
 * there. These six are the ones common enough that finding them should not
 * involve typing at all.
 */
const METERS: readonly TimeSignature[] = [
  { beats: 4, beatUnit: 4 },
  { beats: 3, beatUnit: 4 },
  { beats: 2, beatUnit: 4 },
  { beats: 6, beatUnit: 8 },
  { beats: 9, beatUnit: 8 },
  { beats: 12, beatUnit: 8 },
];

const meterLabel = (meter: TimeSignature) => `${meter.beats}/${meter.beatUnit}`;

const sameMeter = (
  one: TimeSignature | undefined,
  other: TimeSignature | undefined,
) =>
  one?.beats === other?.beats && one?.beatUnit === other?.beatUnit;

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
 * which the music is written against and cannot move under it. That is said
 * once, in the confirmation the way out opens, with the numbers filled in. The
 * marks are only settled *here*: they were guessed against a video nobody had
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

/** One choice in a row of them: a button carrying a diagram of what it picks. */
function cell(label: string, run: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "setup-cell";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", run);
  return button;
}

/** Say whether a cell is the one taken. */
function markCell(button: HTMLButtonElement, on: boolean): void {
  button.setAttribute("aria-pressed", String(on));
  button.classList.toggle("is-on", on);
}

/**
 * One of the page's boxes: a heading, and room under it for the choice.
 *
 * An `aside` is set beside the heading rather than under it — a line about the
 * box, in its corner, out of the way of the controls and still inside the box
 * it is about.
 */
function boxed(title: string, aside?: HTMLElement): HTMLElement {
  const section = document.createElement("section");
  section.className = "panel setup-box";
  const heading = document.createElement("h2");
  heading.className = "setup-box-title";
  heading.textContent = title;
  if (aside === undefined) {
    section.append(heading);
    return section;
  }
  const head = grouped("setup-box-head");
  head.append(heading, aside);
  section.append(head);
  return section;
}

const grouped = (className: string): HTMLElement => {
  const element = document.createElement("div");
  element.className = className;
  return element;
};

/** A line for saying what went wrong, taking no room until it has to. */
function note(className: string): HTMLParagraphElement {
  const line = document.createElement("p");
  line.className = className;
  line.setAttribute("role", "status");
  return line;
}

/** A key as it is printed in a sentence, in the dress the caps on the buttons wear. */
function keyCap(letter: string): HTMLElement {
  const cap = document.createElement("kbd");
  cap.className = "setup-tip-key";
  cap.textContent = letter;
  return cap;
}

/**
 * The felt beats in one bar, or a quarter-note default before a meter is
 * chosen — which is a state only this page has, so the default stays here
 * while the arithmetic lives with the tempo map.
 */
const beatsPerBar = (meter: TimeSignature | undefined): number =>
  meter === undefined ? 4 : beatsPerBarOf(meter);

/**
 * The first page: the video, then the clef, the meter and the section of it
 * being written down.
 *
 * It runs in one direction. Until a video has been named there is nothing on
 * the page but the link box, because every other question here is a question
 * about *that video* — how many bars of it, where they start, what they are
 * counted in — and there is no answering them against no video at all. So the
 * link box is the whole page to begin with, and the rest arrives at once
 * behind it. The box itself does not move when it does.
 *
 * Split into two kinds of region. The boxes are built once and only ever
 * mutated: a redraw would take the caret out of a box mid-keystroke, and would
 * reload the video itself, since an iframe starts over whenever it is
 * replaced. What changes on a pick is which cell is lit, not what is on the
 * page.
 *
 * The clef, the meter and the bar count chosen here are final: the music is
 * written against all three and none can move under it afterwards, which is
 * what the confirmation on the way out says, with the numbers filled in. The
 * timing marks are not among them — they are a first guess at a video nobody
 * has transcribed yet, and the editor can correct them.
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
  /** Why the last thing asked of the timing could not be done. */
  let rejected: string | undefined;

  // ---- the page's title --------------------------------------------------

  const title = document.createElement("h1");
  title.className = "setup-title";
  title.textContent = "Set Up Your Tune";

  // ---- the link box and its Submit --------------------------------------

  const linkPanel = document.createElement("section");
  linkPanel.className = "panel setup-box setup-link";
  const tooltip = pageTooltip();

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

  // Only ever shown holding a problem, and taking no room at all otherwise:
  // a box with a line of empty space kept for a mistake nobody has made reads
  // as a box with something missing from it.
  const linkNote = note("setup-note");

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
    rejected = undefined;
    timing = { locked: false };
    metronomeOn = false;
    videoId = reading.videoId;

    const iframe = mountVideoPanel(videoArea, videoId);
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

  // ---- the clef and the meter, in one box --------------------------------

  // One box, because they are one decision: what stands at the head of the
  // stave before a note is written on it. The clefs are a column and the
  // meters a block beside them, parted by a rule.
  const settingsBox = boxed("Clef and Time Signature");
  settingsBox.classList.add("setup-settings-box");
  const settingsBody = grouped("setup-settings-body");
  settingsBox.append(settingsBody);

  const clefRow = grouped("setup-row setup-clef-row");
  // The heading's own word, standing where it says the same thing about the
  // two halves: one box, two choices, and no rule drawn between them.
  const joiner = document.createElement("span");
  joiner.className = "setup-and";
  joiner.textContent = "and";
  settingsBody.append(clefRow, joiner);

  const clefCells = CLEFS.map((candidate) => {
    const button = cell(`${candidate} clef`, () => {
      clef = candidate;
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
    return { button, clef: candidate as string };
  });

  const meterBody = grouped("setup-meter-body");
  const meterRow = grouped("setup-row setup-meter-row");
  meterBody.append(meterRow);
  settingsBody.append(meterBody);

  const meterCells = METERS.map((candidate) => {
    const button = cell(`${meterLabel(candidate)} time`, () => {
      setMeter(candidate);
      // The boxes below follow the pick, so the two are never two answers.
      meterField.show(candidate);
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
    return { button, meter: candidate };
  });

  // Beside the six rather than under them: the same question answered a slower
  // way, not a second question, so nothing is drawn between them.
  const customRow = grouped("setup-meter-custom");
  const customLabel = document.createElement("span");
  customLabel.className = "setup-sub-label";
  customLabel.textContent = "Or write one";
  const meterField: MeterField = createMeterField({
    onChange: (chosen) => setMeter(chosen),
  });
  customRow.append(customLabel, meterField.element);
  meterBody.append(customRow);

  /**
   * Take a meter, from either the buttons or the boxes.
   *
   * The two are one answer, not two: a button fills the boxes, and typing in
   * the boxes lights whichever button it lands on.
   */
  function setMeter(chosen: TimeSignature | undefined): void {
    if (sameMeter(chosen, meter)) return;
    meter = chosen;
    // The tempo is counted in this meter's beats, so the shown BPM moves even
    // though no mark did. The panel holds this back while its box is empty:
    // picking a meter before anything is marked moves no tempo.
    panel.flash(["bpm"]);
    refresh();
  }

  // ---- the section: the timing panel beside the video --------------------

  // Two columns rather than one. The marks are read off the video, so the
  // video stands beside them where both can be watched at once, with the speed
  // it is being watched at over it — and the panel, freed of the slider, is no
  // wider than the rows it actually has.
  const tip = document.createElement("p");
  tip.className = "setup-tip";
  tip.append(
    "Tap the ",
    keyCap("I"),
    " and ",
    keyCap("O"),
    " keys to mark the start and end of the section. Slow the video down for " +
      "better results, and check your work using the metronome.",
  );

  const sectionBox = boxed("Section to Transcribe", tip);
  sectionBox.classList.add("setup-section-box");

  const timingArea = document.createElement("div");
  timingArea.id = "setup-timing";
  const marksColumn = grouped("setup-section-marks");
  marksColumn.append(timingArea);

  // Under the marks it belongs with, rather than over the player: it is one of
  // the things being set, and the right-hand half of this box is the video and
  // nothing else.
  const speed = createSpeedRow((rate) => rig?.setRate(rate));
  marksColumn.append(speed.element);

  // Empty until the link is given, and never seen empty: the box it stands in
  // is not on the page until there is a video to put here.
  const videoArea = document.createElement("div");
  videoArea.id = "setup-video";
  const playerColumn = grouped("setup-section-player");
  playerColumn.append(videoArea);

  const sectionBody = grouped("setup-section-body");
  sectionBody.append(marksColumn, playerColumn);

  // What the timing refused, under both columns rather than inside the narrow
  // one — a bar count past the longest transcription there is, most of all.
  const timingNote = note("setup-note is-wrong");
  sectionBox.append(sectionBody, timingNote);

  /** Run one reducer action, flash what it rewrote, and follow through. */
  function act(action: TimingAction): void {
    const step = stepTiming(
      timing,
      action,
      beatsPerBar(meter),
      rig && rig.duration() > 0 ? rig.duration() : undefined,
    );
    timing = step.state;
    // Said in the box rather than swallowed: a bar count over the limit, or a
    // locked edit that would run past the video, is a thing the user did and
    // is owed an answer to. Cleared by the next thing that works.
    rejected = step.rejected;
    if (step.rejected) {
      // Refused, and the state did not move: the boxes go back to showing what
      // they still hold, and the line below the panel says why.
      refresh();
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

  const panel: TimingPanel = createTimingPanel(
    timingArea,
    {
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
    },
    // The bar count is still being settled here; the two mark keys are printed
    // where they can be seen, since marking the section is the first thing
    // anybody does on this page; each row's button follows the word that names
    // it, leaving the box the whole of the rest of the row; and the speed
    // slider is placed by this page, under the rows rather than in a band of
    // its own.
    {
      measures: "editable",
      keys: "corner",
      speed: "outside",
      buttons: "leading",
    },
  );

  // ---- the way out -------------------------------------------------------

  const start = document.createElement("button");
  start.type = "button";
  start.className = "setup-submit";
  start.textContent = "Begin Transcribing! →";

  const foot = grouped("setup-foot");
  foot.append(start);

  /** What still stands between here and a melody, or nothing. */
  function whatIsMissing(): string | undefined {
    if (trouble) return trouble;
    if (!clef) return "Choose a clef.";
    if (!meter) return "Choose a time signature.";
    if (!rigReady) return "Waiting for the video…";
    return timingProblem(timing, beatsPerBar(meter));
  }

  /** The reason the way out is grey, or nothing while it is not. */
  let missing: string | undefined;

  /**
   * Dead rather than disabled, so it can be pointed at.
   *
   * The reason used to stand in a line beside the button, which is a standing
   * fact taking a line of page for as long as it is true. It is now asked for
   * instead: hover the grey button and it says what is left to do. A `disabled`
   * button receives no pointer events at all and could answer nothing, so this
   * is `aria-disabled` with the press refused below — the same way round the
   * greyed duration cells and the dead piano keys take.
   */
  const sayWhyGrey = () => {
    if (missing === undefined) return;
    // Over the button rather than beside the pointer. The pointer is the right
    // anchor for a small control being swept over, and the wrong one here: a
    // browser fires `pointerenter` *before* the move that caused it, so the
    // remembered position is the one before this button — and this button is
    // wide enough that its own top edge is a better place regardless.
    const box = start.getBoundingClientRect();
    tooltip.say(missing, { x: box.left + box.width / 2, y: box.top });
  };
  start.addEventListener("pointerenter", sayWhyGrey);
  start.addEventListener("pointerleave", () => tooltip.say(undefined));
  start.addEventListener("focus", sayWhyGrey);
  start.addEventListener("blur", () => tooltip.say(undefined));

  start.addEventListener("click", () => {
    const map = currentMap();
    if (!clef || !meter || !videoId || !map || timing.measures === undefined) {
      sayWhyGrey();
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
      title: "Are you sure?",
      // The three settings read back as they will be written, each marked, so
      // that checking them against the video is a matter of reading four words
      // rather than of remembering what was picked ten minutes ago.
      body: [
        [
          "Beyond this point, the clef, number of measures, and time " +
            "signature ",
          marked("cannot be changed"),
          ".",
        ],
        [
          "Your tune will consist of ",
          marked(bars),
          " of ",
          marked(meterLabel(chosen.meter)),
          " written in ",
          marked(`${chosen.clef} clef`),
          "—is that correct?",
        ],
      ],
      confirm: "Yes, proceed",
      cancel: "Go back",
      className: "setup-confirm",
    }).then((confirmed) => {
      if (!confirmed) return;
      // The player is let go before its iframe is thrown away, and the page
      // cleans itself up entirely — nothing here survives into the editor.
      window.removeEventListener("keydown", onKey);
      rig?.destroy();
      // Hushed rather than destroyed: the tooltip belongs to the page, and the
      // editor is about to want it.
      tooltip.say(undefined);
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
      metered: meter !== undefined,
    };
  }

  function refresh(): void {
    // Everything but the link box is a question about a particular video, so
    // until there is one there is nothing here to ask it about — and the rest
    // of the page is not drawn greyed, it is not drawn.
    const asked = videoId !== undefined;
    columns.hidden = !asked;
    foot.hidden = !asked;

    for (const candidate of clefCells) {
      markCell(candidate.button, clef === candidate.clef);
    }
    for (const candidate of meterCells) {
      markCell(candidate.button, sameMeter(meter, candidate.meter));
    }

    panel.update(panelState());
    speed.update(rig?.rates() ?? [1], rig?.rate() ?? 1, rigReady);
    timingNote.textContent = rejected ?? "";

    missing = asked ? whatIsMissing() : "Load the video you are writing from.";
    start.setAttribute("aria-disabled", String(missing !== undefined));
  }

  const columns = grouped("setup-columns");
  columns.append(settingsBox, sectionBox);

  element.append(title, linkPanel, columns, foot);
  refresh();
}
