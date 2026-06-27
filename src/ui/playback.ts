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
  beatsPerMinute,
  secondsAtPosition,
  tempoMapOf,
  type Marks,
  type TempoMap,
} from "../playback/tempo-map.js";
import { toMilliseconds } from "../playback/timecode.js";
import type { MelodyRenderResult } from "../render/render-melody.js";
import { createPlaybackPanel, type PlaybackPanel } from "./playback-panel.js";
import { createPlayhead, type Playhead } from "./playhead.js";
import { isTypingTarget } from "./typing-guard.js";
import { createVideoRig, type VideoRig } from "./video-rig.js";

/** Everything the setup page settled, frozen. */
export type PlaybackConfig = {
  marks: Marks;
  measures: number;
  meter: TimeSignature;
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

/**
 * The melody page's side of the video.
 *
 * The tempo is not measured here — it arrived frozen from the setup page, and
 * everything on this page reads from it: where each note falls in the video,
 * where the metronome clicks, where the marker stands on the stave. What this
 * page adds is the *section*: a stretch of the video played on its own, looped
 * if asked, marked off the clock or off the selected note.
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
): Playback {
  const map: TempoMap | undefined = tempoMapOf(
    config.marks,
    config.measures,
    config.meter,
  );

  /** When each event begins and ends, in video seconds; indexed like the melody. */
  let onsets: number[] = [];
  let ends: number[] = [];

  let rigReady = false;
  let trouble: string | undefined;
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

  // ---- what the panel says ---------------------------------------------

  function note(): string {
    if (trouble) return trouble;
    if (!map) return "The timing from the setup page did not add up.";
    const bars = config.measures === 1 ? "1 bar" : `${config.measures} bars`;
    return `${bars} · ${Math.round(beatsPerMinute(map))} BPM`;
  }

  function refresh(): void {
    panel.update({
      ready: rigReady,
      rates: rig.rates(),
      rate: rig.rate(),
      start: sectionStart,
      end: sectionEnd,
      playing: section?.playing ?? false,
      looping: section?.looping ?? false,
      canPlay: rigReady && map !== undefined,
      hasSelection,
      metronomeOn,
      followOn,
      timed: map !== undefined,
      note: note(),
    });
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

  /** The letter shortcuts, from the page or from inside a time box. */
  const onLetter = (letter: string, shift: boolean): boolean => {
    if (!rigReady) return false;
    if (letter === "i") {
      if (shift) fromNote("start");
      else markNow("start");
      return true;
    }
    if (letter === "o") {
      if (shift) fromNote("end");
      else markNow("end");
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

  // ---- the panel --------------------------------------------------------

  const panel: PlaybackPanel = createPlaybackPanel(elements.panel, {
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

  // ---- the score --------------------------------------------------------

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
      if (!map) return;
      const positions = eventPositions(next);
      onsets = positions.map((position) =>
        secondsAtPosition(map, position.start.toNumber()),
      );
      ends = positions.map((position) =>
        secondsAtPosition(map, position.start.add(position.length).toNumber()),
      );
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
