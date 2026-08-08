import { eventPositions } from "../editor/position.js";
import type { Melody } from "../music/melody.js";
import type { TimeSignature } from "../music/types.js";
import {
  createSection,
  pressJumpBack,
  pressPause,
  pressPlay,
  setLooping,
  setRange,
  stepSection,
  type SectionState,
  type SectionStep,
} from "../playback/section-play.js";
import {
  beatsPerBarOf,
  beatsPerMinute,
  secondsAtPosition,
  tempoMapOf,
  type Marks,
  type TempoMap,
} from "../playback/tempo-map.js";
import { toMilliseconds } from "../playback/timecode.js";
import {
  bpmOf,
  stepTiming,
  timingProblem,
  type TimingAction,
  type TimingState,
} from "../playback/timing-fields.js";
import type { MelodyRenderResult } from "../render/render-melody.js";
import { createPlaybackPanel, type PlaybackPanel } from "./playback-panel.js";
import { createPlayhead, type Playhead } from "./playhead.js";
import { createTimingPanel, type TimingPanel } from "./timing-panel.js";
import { isTypingTarget } from "./typing-guard.js";
import { createVideoRig, type VideoRig } from "./video-rig.js";

/** Where the music sits in the video, and how much of it there is. */
export type PlaybackConfig = {
  marks: Marks;
  measures: number;
  meter: TimeSignature;
};

export type PlaybackOptions = {
  /**
   * Whether the timing may be corrected here.
   *
   * True in the editor, where the marks were first guessed against a video
   * nobody had transcribed yet. False wherever a level is being played: the
   * marks are then part of the level rather than part of the work, and moving
   * them would move the answer.
   */
  canRetime?: boolean;
  /** The marks were changed; the page that owns them should take them on. */
  onRetime?: (marks: Marks) => void;
};

export type Playback = {
  /** Take on a melody, whether freshly edited or arrived whole from undo. */
  follow(melody: Melody): void;
  /** Take on the score as it now stands, after any redraw. */
  onScore(rendered: MelodyRenderResult): void;
  /** The score's selection moved. */
  onSelect(index: number | undefined): void;
  destroy(): void;
};

/** Which of the two panels the controls column is showing. */
type Mode = "playback" | "timing";

/**
 * The melody page's side of the video.
 *
 * Two jobs share one column, and only one is on screen at a time. *Playback*
 * is a stretch of the video played on its own, looped if asked, marked off the
 * clock or off the selected note. *Timing* is where the first bar starts and
 * the last one ends — the two moments everything else is measured from.
 *
 * They are swapped rather than shown together because they look identical and
 * mean different things: both are a pair of marks with the same icons on the
 * same two keys. Only one pair being on screen is what makes `I` and `O`
 * unambiguous, without anyone having to remember a rule.
 *
 * Made once and outliving every rebuild of the editor around it: switching
 * modes or undoing throws the editor away, and the video must not restart
 * because of it.
 */
export function createPlayback(
  elements: { panel: HTMLElement; scoreArea: HTMLElement },
  iframe: HTMLIFrameElement,
  config: PlaybackConfig,
  selection: () => number | undefined,
  options: PlaybackOptions = {},
): Playback {
  const canRetime = options.canRetime ?? false;
  const beatsPerBar = beatsPerBarOf(config.meter);

  /**
   * The tempo, and the two marks it is read from.
   *
   * No longer settled once and for all: correcting the marks rebuilds the map,
   * and everything read from it has to be read again — the onsets each note
   * falls on, the metronome's clicks, the playhead, and the line reporting the
   * tempo. `retime()` below is the one place that happens.
   */
  let timing: TimingState = {
    start: config.marks.start,
    end: config.marks.end,
    measures: config.measures,
    locked: false,
  };
  let map: TempoMap | undefined = tempoMapOf(
    config.marks,
    config.measures,
    config.meter,
  );

  /** When each event begins and ends, in video seconds; indexed like the melody. */
  let onsets: number[] = [];
  let ends: number[] = [];
  /** The melody last taken on, so a re-timing can recompute against it. */
  let following: Melody | undefined;

  let mode: Mode = "playback";
  let rigReady = false;
  let trouble: string | undefined;
  let rejected: string | undefined;
  let sectionStart = map?.start;
  let sectionEnd = map?.end;
  // Looping and following both start on: looping a passage and watching where
  // it sits on the stave are what this page is for, so they are the resting
  // state rather than something switched on every session.
  let section: SectionState | undefined = map
    ? setLooping(createSection({ start: map.start, end: map.end }), true)
    : undefined;

  let metronomeOn = false;
  let followOn = map !== undefined;
  let hasSelection = false;

  const playhead: Playhead = createPlayhead(elements.scoreArea);
  const rig: VideoRig = createVideoRig(iframe);

  /** What the marks still get wrong, or nothing. */
  const problem = () => timingProblem(timing, beatsPerBar);

  // ---- what the panels say ---------------------------------------------

  function note(): string {
    if (trouble) return trouble;
    if (rejected) return rejected;
    const wrong = problem();
    if (wrong) return wrong;
    if (!map) return "The timing does not add up.";
    const bars = config.measures === 1 ? "1 bar" : `${config.measures} bars`;
    return `${bars} · ${Math.round(beatsPerMinute(map))} BPM`;
  }

  function refresh(): void {
    const shared = {
      ready: rigReady,
      rates: rig.rates(),
      rate: rig.rate(),
      timed: map !== undefined && problem() === undefined,
      note: note(),
    };

    panel.update({
      ...shared,
      start: sectionStart,
      end: sectionEnd,
      playing: section?.playing ?? false,
      looping: section?.looping ?? false,
      canPlay: rigReady && map !== undefined,
      hasSelection,
      metronomeOn,
      followOn,
    });

    timingPanel?.update({
      ...shared,
      timing,
      bpmText: (() => {
        const bpm = bpmOf(timing, beatsPerBar);
        return bpm === undefined ? undefined : String(Math.round(bpm * 10) / 10);
      })(),
      metronomeOn,
    });

    if (modes) {
      for (const option of modes) {
        const on = option.mode === mode;
        option.button.setAttribute("aria-pressed", String(on));
        option.button.classList.toggle("is-on", on);
      }
      playbackHost.hidden = mode !== "playback";
      timingHost.hidden = mode !== "timing";
    }
  }

  // ---- the section machine ---------------------------------------------

  /** Carry out what the machine decided. */
  function run(step: SectionStep): void {
    const before = section;
    section = step.state;
    for (const command of step.commands) {
      switch (command.kind) {
        case "seek":
          rig.seekTo(command.to);
          break;
        case "play":
          rig.play();
          break;
        case "pause":
          rig.pause();
          break;
      }
    }
    if (
      step.commands.length > 0 ||
      before?.playing !== section.playing
    ) {
      refresh();
    }
  }

  const unsubscribe = rig.subscribe({
    onTick(now, wall) {
      if (section) run(stepSection(section, { kind: "tick", now, wall }));
      playhead.show(followOn ? eventAt(now) : undefined);
    },
    onJump(to, wall) {
      if (section) run(stepSection(section, { kind: "jump", to, wall }));
    },
    onLife(life, now, wall) {
      if (section) run(stepSection(section, { kind: "state", state: life, now, wall }));
    },
    onRate() {
      refresh();
    },
  });

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

  // ---- the section fields ----------------------------------------------

  function applyRange(): void {
    if (section && sectionStart !== undefined && sectionEnd !== undefined) {
      // Any pair of marks is legal. An end at-or-before the start is simply
      // an end that means nothing — the machine ignores it — while the start
      // keeps its whole meaning.
      section = setRange(section, { start: sectionStart, end: sectionEnd });
    }
    refresh();
  }

  function setMark(field: "start" | "end", seconds: number): void {
    const value = Math.max(0, toMilliseconds(seconds));
    if (field === "start") {
      sectionStart = value;
    } else {
      sectionEnd = value;
    }
    applyRange();
  }

  const markNow = (field: "start" | "end") => {
    if (!rigReady) return;
    setMark(field, rig.now());
  };

  function fromNote(field: "start" | "end"): void {
    const index = selection();
    if (index === undefined) return;
    const seconds = field === "start" ? onsets[index] : ends[index];
    if (seconds === undefined) return;
    setMark(field, seconds);
  }

  // ---- the timing fields -----------------------------------------------

  /**
   * Take the tempo the marks now describe.
   *
   * Everything downstream of the map is read from the map, so all of it is
   * read again here: the onsets the playhead and the section fields are
   * matched against, and the metronome's own copy of the tempo. The section is
   * deliberately left where it is — correcting the timing corrects the timing,
   * and the reset button beside each playback mark is already the way to snap
   * a loop back onto the marks.
   */
  function retime(): void {
    map =
      problem() === undefined
        ? tempoMapOf(
            { start: timing.start!, end: timing.end! },
            config.measures,
            config.meter,
          )
        : undefined;

    if (following) {
      // Onsets are seconds, and every one of them just moved.
      takeOnsets(following);
    }
    if (!map) {
      playhead.show(undefined);
    }
    // The metronome clicks the marked tempo, so it follows every change — and
    // falls silent the moment the marks stop describing one.
    if (metronomeOn) {
      rig.setMetronome(map);
    }
    options.onRetime?.({ start: timing.start!, end: timing.end! });
    refresh();
  }

  function act(action: TimingAction): void {
    const step = stepTiming(
      timing,
      action,
      beatsPerBar,
      rig.duration() > 0 ? rig.duration() : undefined,
    );
    if (step.rejected) {
      // The note line carries the reason; the state did not move.
      rejected = step.rejected;
      refresh();
      return;
    }
    rejected = undefined;
    timing = step.state;
    timingPanel?.flash(step.autoEdited);
    retime();
  }

  function playPause(): void {
    if (!section || !rigReady) return;
    run(
      section.playing
        ? pressPause(section)
        : pressPlay(section, rig.now()),
    );
  }

  function jumpBack(): void {
    if (!section || !rigReady) return;
    run(pressJumpBack(section));
  }

  /**
   * The letter shortcuts, from the page or from inside a time box.
   *
   * `I` and `O` mean whichever pair of marks is on screen. That is the whole
   * reason the panels swap rather than sit side by side: two pairs of marks
   * with one pair of keys between them would need a rule, and this needs none.
   */
  const onLetter = (letter: string, shift: boolean): boolean => {
    if (!rigReady) return false;
    if (letter === "i" || letter === "o") {
      const field = letter === "i" ? "start" : "end";
      if (mode === "timing") {
        // No shifted variant here: a note's onset is worked out *from* these
        // marks, so setting a mark from a note would be circular.
        if (shift) return false;
        act({
          kind: field === "start" ? "mark-start" : "mark-end",
          seconds: rig.now(),
        });
        return true;
      }
      if (shift) fromNote(field);
      else markNow(field);
      return true;
    }
    if (letter === "r" && !shift) {
      jumpBack();
      return true;
    }
    return false;
  };

  function onKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event)) return;
    if (event.key === " ") {
      // Taking the default also keeps a focused button from firing itself on
      // the same press — space means the transport, wherever focus sits.
      playPause();
      event.preventDefault();
      return;
    }
    if (
      /^[a-z]$/i.test(event.key) &&
      onLetter(event.key.toLowerCase(), event.shiftKey)
    ) {
      event.preventDefault();
    }
  }
  window.addEventListener("keydown", onKey);

  // ---- the panels -------------------------------------------------------

  elements.panel.replaceChildren();

  let modes:
    | readonly { button: HTMLButtonElement; mode: Mode }[]
    | undefined;

  if (canRetime) {
    const switcher = document.createElement("div");
    switcher.className = "mode-switch panel-switch";
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "What the controls below do");

    modes = ([
      ["Playback", "playback"],
      ["Timing", "timing"],
    ] as const).map(([label, which]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mode-option";
      button.textContent = label;
      button.addEventListener("click", () => {
        mode = which;
        // A rejection belonged to the panel that is no longer showing.
        rejected = undefined;
        refresh();
      });
      switcher.append(button);
      return { button, mode: which };
    });

    elements.panel.append(switcher);
  }

  const playbackHost = document.createElement("div");
  const timingHost = document.createElement("div");
  timingHost.hidden = true;
  elements.panel.append(playbackHost, timingHost);

  const panel: PlaybackPanel = createPlaybackPanel(playbackHost, {
    onRate: (rate) => rig.setRate(rate),

    onPlayPause: playPause,

    onLoop(on) {
      if (!section) return;
      section = setLooping(section, on);
      refresh();
    },

    onJumpBack: jumpBack,

    onResetMark(field) {
      if (!map) return;
      setMark(field, field === "start" ? map.start : map.end);
    },

    onMark: markNow,

    onType(field, seconds) {
      if (seconds === undefined) {
        // A playback bound always holds something; an emptied box comes back.
        refresh();
        return;
      }
      setMark(field, seconds);
    },

    onNudge(field, seconds) {
      const current = field === "start" ? sectionStart : sectionEnd;
      if (current === undefined) return;
      setMark(field, current + seconds);
    },

    onFromNote: fromNote,

    onMetronome(on) {
      metronomeOn = on && map !== undefined;
      // Inside the click, which is the only place sound may start from.
      rig.setMetronome(metronomeOn ? map : undefined);
      refresh();
    },

    onFollow(on) {
      followOn = on && map !== undefined;
      if (!followOn) playhead.show(undefined);
      refresh();
    },

    onLetter,
  });

  /**
   * The timing panel, when the timing is this page's to correct.
   *
   * The bar count is not among its fields: here the bars are the melody's own
   * length and cannot move, so the box is left out and the note line reports
   * the count instead.
   */
  const timingPanel: TimingPanel | undefined = canRetime
    ? createTimingPanel(
        timingHost,
        {
          onRate: (rate) => rig.setRate(rate),
          onMark: (field) => {
            if (!rigReady) return;
            act({
              kind: field === "start" ? "mark-start" : "mark-end",
              seconds: rig.now(),
            });
          },
          onType: (field, seconds) =>
            act({
              kind: field === "start" ? "type-start" : "type-end",
              seconds,
            }),
          onNudge: (field, seconds) => act({ kind: "nudge", field, seconds }),
          // The bar count is the melody's, and the melody is not edited here.
          onTypeMeasures: () => {},
          onTypeBpm: (bpm) => act({ kind: "type-bpm", bpm }),
          onToggleLock: () => act({ kind: "toggle-lock" }),
          onMetronome(on) {
            metronomeOn = on && map !== undefined;
            rig.setMetronome(metronomeOn ? map : undefined);
            refresh();
          },
          onLetter,
        },
        { measures: "fixed" },
      )
    : undefined;

  // ---- the score --------------------------------------------------------

  /** Where each event falls in the video, at the tempo as it now stands. */
  function takeOnsets(melody: Melody): void {
    following = melody;
    if (!map) {
      onsets = [];
      ends = [];
      return;
    }
    const positions = eventPositions(melody);
    onsets = positions.map((position) =>
      secondsAtPosition(map!, position.start.toNumber()),
    );
    ends = positions.map((position) =>
      secondsAtPosition(map!, position.start.add(position.length).toNumber()),
    );
  }

  /** Which event is sounding at a video second, or none outside the music. */
  function eventAt(seconds: number): number | undefined {
    if (!map || onsets.length === 0) return undefined;
    if (seconds < map.start || seconds > map.end) return undefined;

    let low = 0;
    let high = onsets.length - 1;
    let found = 0;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (onsets[middle]! <= seconds) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }

  refresh();

  return {
    follow(next) {
      takeOnsets(next);
    },

    onScore(rendered) {
      playhead.onScore(rendered);
    },

    onSelect(index) {
      const has = index !== undefined;
      if (has !== hasSelection) {
        hasSelection = has;
        refresh();
      }
    },

    destroy() {
      window.removeEventListener("keydown", onKey);
      unsubscribe();
      playhead.destroy();
      rig.destroy();
    },
  };
}
