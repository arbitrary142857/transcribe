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
import { eventAtSeconds } from "../playback/follow.js";
import {
  boundaryTimes,
  nearestBoundary,
} from "../playback/section-bounds.js";
import type { PianoNote } from "../playback/piano.js";
import { soundingNotes } from "../playback/playalong.js";
import { toMilliseconds } from "../playback/timecode.js";
import {
  bpmOf,
  markedField,
  stepTiming,
  timingProblem,
  type TimingAction,
  type TimingState,
} from "../playback/timing-fields.js";
import type { MelodyRenderResult } from "../render/render-melody.js";
import { createPlaybackPanel, type PlaybackPanel } from "./playback-panel.js";
import { createPlayhead, type Playhead } from "./playhead.js";
import {
  createSectionBrackets,
  type SectionBrackets,
} from "./section-brackets.js";
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
  /**
   * Rebuild the embed, with or without YouTube's own control bar, and hand
   * back the new iframe.
   *
   * Wanted only where the mode can switch: playback drives the player from
   * the panel and wants no control bar flashing under it, while setting the
   * timing scrubs with YouTube's own — and the bar is a parameter of the
   * embed, changeable only by loading a new one. The switch puts the
   * position, speed and loudness back itself.
   */
  remountVideo?: (options: { controls: boolean }) => HTMLIFrameElement;
  /**
   * Whether "hear the notes" is one of assist mode's two tools here, and
   * whether it is locked as the page opens.
   *
   * Given by the play page only. In the editor the transcription is the
   * author's own work and playing it back is how they check it; on the play
   * page it is most of the answer, so it waits to be asked for.
   */
  assist?: { locked: boolean };
};

export type Playback = {
  /**
   * Let the transcription be heard, assist mode having been unlocked.
   *
   * One way only, and idempotent: the page calls it on activation and again on
   * the solve, and there is nothing that locks it back.
   */
  unlockAssist(): void;
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
 * is a stretch of the video played on its own, looped if asked, its ends taken
 * from the selected note. *Timing* is where the first bar starts and the last
 * one ends — the two moments everything else is measured from, taken from the
 * clock, since there are no onsets yet to take them from.
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
  /** False wherever the toggle is not an assist tool at all — the editor. */
  let assistLocked = options.assist?.locked ?? false;
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
  /** The melody as something to play: sounding notes only, in video seconds. */
  let played: PianoNote[] = [];
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
  /**
   * Whether the transcription is heard along with the video.
   *
   * One toggle. How loud the video speaks is the volume slider's business
   * alone — hearing the notes by themselves is this toggle plus the slider
   * at zero, so nothing here ever mutes the player behind the slider's back.
   */
  let notesOn = false;
  let followOn = map !== undefined;
  let hasSelection = false;

  const playhead: Playhead = createPlayhead(elements.scoreArea);
  const brackets: SectionBrackets = createSectionBrackets(elements.scoreArea);
  const rig: VideoRig = createVideoRig(iframe);

  /** The iframe as it now stands — the mode switch trades it for another. */
  let frame = iframe;

  /**
   * Whether the player itself can be touched, which follows the mode.
   *
   * The section is played from this panel, and a first-time visitor clicking
   * the embed's own play starts the video from 0:00 — a moment that means
   * nothing here. So the player is out of reach while the panel drives it,
   * and a click on it fades a line in below saying where to press instead.
   * Setting the timing is the exception: the marks are taken off the video's
   * own clock, and YouTube's scrubber is how the clock is moved — so in that
   * mode the player is its ordinary self.
   *
   * Only the pointer is fenced, and only on this client. The rig never trusts
   * the fence: it watches the player for seeks and pauses it did not cause
   * (buffering and the resume slip produce them with nobody clicking at all),
   * so stripping the style in devtools breaks nothing but the styling.
   */
  function applyReach(): void {
    frame.classList.toggle("is-inert", mode !== "timing");
  }

  /**
   * The line that fades in under the player when the fence is clicked.
   *
   * It holds its line in the flow whether or not it is showing, so that its
   * coming and going moves nothing else in the column and — more to the point
   * — so that nothing else can ever be laid where it will appear.
   */
  const videoNote = document.createElement("p");
  videoNote.className = "video-note";
  videoNote.textContent = "Use the playback panel!";

  /** Adopt an iframe: the fence, and the click that teaches where play went. */
  function takeFrame(next: HTMLIFrameElement): void {
    frame = next;
    applyReach();
    // The note lives on #video, which survives remounts; put it back anyway,
    // because the remount clears that element's children.
    next.parentElement?.parentElement?.append(videoNote);
    // The click lands on the holder behind the fenced iframe.
    next.parentElement?.addEventListener("click", () => {
      if (!frame.classList.contains("is-inert")) return;
      videoNote.classList.remove("is-shown");
      // Forcing a reflow restarts the fade when two clicks land close.
      void videoNote.offsetWidth;
      videoNote.classList.add("is-shown");
    });
  }

  /** What the marks still get wrong, or nothing. */
  const problem = () => timingProblem(timing, beatsPerBar);

  // ---- what the panels say ---------------------------------------------

  function refresh(): void {
    const shared = {
      ready: rigReady,
      rates: rig.rates(),
      rate: rig.rate(),
      volume: rigReady ? rig.volume() : 100,
      timed: map !== undefined && problem() === undefined,
      // The melody has a meter, always: it was settled before this page was
      // built and cannot move.
      metered: true,
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
      notesOn,
      followOn,
      assistLocked,
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
    applyReach();
    showBrackets();
  }

  /**
   * Stand the two brackets in the gaps the marks fall in.
   *
   * Here rather than beside the machine because this runs on every change the
   * panel is told about, which is every way a mark can move: typed, nudged,
   * taken from a note, reset, or re-timed under them. Both are always shown —
   * a section whose end sits before its start is something somebody did, and
   * hiding half of it would leave them guessing which mark moved.
   */
  function showBrackets(): void {
    const times = boundaryTimes(onsets, ends);
    brackets.show(
      sectionStart === undefined
        ? undefined
        : nearestBoundary(times, sectionStart),
      sectionEnd === undefined ? undefined : nearestBoundary(times, sectionEnd),
    );
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
      const range = { start: sectionStart, end: sectionEnd };
      // Handed over as a fact rather than set behind the machine's back: moving
      // the marks can leave the playhead outside the section, and only the
      // machine knows whether that calls for a wrap, a pause or nothing. Every
      // route here is a committed change — the time fields commit on blur and
      // Enter, never per keystroke — so this cannot fire mid-typing.
      if (rigReady) {
        run(stepSection(section, { kind: "range", range, now: rig.now() }));
      } else {
        section = setRange(section, range);
      }
    }
    refresh();
  }

  /**
   * Write one section mark.
   *
   * `announced` flashes the box, and is on for every route except typing into
   * it and stepping it: those two are the box's own controls, so the caret is
   * already there and a pulse would only be telling somebody what they just
   * did. The rest — the mark buttons, the from-the-selected-note buttons, the
   * reset, and `I` / `O` / `⇧I` / `⇧O` — land a value somewhere the eye is not.
   */
  function setMark(
    field: "start" | "end",
    seconds: number,
    { announced = true } = {},
  ): void {
    const value = Math.max(0, toMilliseconds(seconds));
    if (field === "start") {
      sectionStart = value;
    } else {
      sectionEnd = value;
    }
    applyRange();
    if (announced) panel.flash(field);
  }

  function fromNote(field: "start" | "end"): void {
    const index = selection();
    if (index === undefined) return;
    const seconds = field === "start" ? onsets[index] : ends[index];
    if (seconds === undefined) return;
    // Both marks are the note's own timestamp, exactly. A start set a breath
    // early so the attack is heard arriving was tried and taken back out: a
    // mark means the note it was taken from, and nothing else.
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
    // `takeOnsets` has already re-handed the notes when there is a melody; this
    // is the case where the marks stopped describing a tempo at all.
    if (!following) sendPlayalong();
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
    timingPanel?.flash([...step.autoEdited, ...markedField(action)]);
    retime();
  }

  /**
   * Turn the transcription's own sound on or off.
   *
   * Called inside a press, which is what lets the piano's audio context be
   * made at all. The video is never touched: its loudness belongs to the
   * volume slider alone, and hearing the notes by themselves is this plus
   * the slider at zero.
   */
  function setNotes(on: boolean): void {
    // The panel refuses the press and says why, so this is the backstop for
    // every other way in — there is none today, and the rule belongs with the
    // sound rather than with the button that asks for it.
    if (assistLocked) return;
    notesOn = on && map !== undefined;
    sendPlayalong();
    refresh();
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
      // Unshifted in both panels, and meaning the only thing each pair of marks
      // can be taken from. Timing marks come off the clock, because a note's
      // onset is worked out *from* them and taking one from a note would be
      // circular. Section marks come off the score, because by then the onsets
      // exist and are exact, which the clock is not.
      if (shift) return false;
      if (mode === "timing") {
        act({
          kind: field === "start" ? "mark-start" : "mark-end",
          seconds: rig.now(),
        });
        return true;
      }
      fromNote(field);
      return true;
    }
    // Restart belongs to the section, and the section is the playback mode's:
    // while the timing is being set there is no transport for it to mean.
    if (letter === "r" && !shift && mode === "playback") {
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
      //
      // In timing mode there is no transport: the video is scrubbed by hand
      // there, so space runs and stops it in place, seeking nowhere.
      if (mode === "timing") {
        if (rigReady) {
          if (rig.playing()) {
            rig.pause();
          } else {
            rig.play();
          }
        }
      } else {
        playPause();
      }
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

  // The shell: the mode tabs where there are two modes, seated on the boxed
  // body whichever panel the mode names fills. The panels draw no box of
  // their own, so switching modes swaps the contents of one box rather than
  // trading one box for another. The button that reveals the stickers stands
  // above all of this, with the panel's other tools — see `side-tools.ts`.

  const shell = document.createElement("section");
  shell.className = "playback-shell";
  elements.panel.append(shell);

  let modes:
    | readonly { button: HTMLButtonElement; mode: Mode }[]
    | undefined;

  if (canRetime) {
    const switcher = document.createElement("div");
    switcher.className = "panel-tabs";
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "What the controls below do");

    modes = ([
      ["Playback", "playback"],
      ["Set Timing", "timing"],
    ] as const).map(([label, which]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-tab";
      button.textContent = label;
      button.addEventListener("click", () => {
        if (mode !== which) void switchMode(which);
      });
      switcher.append(button);
      return { button, mode: which };
    });

    shell.append(switcher);
  }

  /**
   * Change modes, trading the embed for the other kind on the way.
   *
   * Playback wants a player with no control bar — driven from the panel, its
   * chrome only flashes distraction at every loop — while setting the timing
   * scrubs with YouTube's own controls. The bar is a parameter of the embed,
   * changeable only by loading a new one, so the switch reloads the player
   * and puts back everything the reload forgets: the position, the speed,
   * the loudness, and the motion. Motion comes back for free — seeking a
   * freshly cued player starts it, and the browser allows the sound because
   * the switch was a click — so the work is stopping it again for a video
   * that was standing still.
   */
  async function switchMode(next: Mode): Promise<void> {
    mode = next;
    // A rejection belonged to the panel that is no longer showing.
    rejected = undefined;
    if (!options.remountVideo || !rigReady) {
      refresh();
      return;
    }

    const at = rig.now();
    const rate = rig.rate();
    const volume = rig.volume();
    const wasPlaying = rig.playing();
    // Told rather than left to notice: the machine must not spend the swap
    // believing a player that no longer exists is still running.
    if (section?.playing) run(pressPause(section));
    rigReady = false;
    refresh();

    try {
      const swapped = options.remountVideo({ controls: next === "timing" });
      takeFrame(swapped);
      await rig.swap(swapped);
      rig.seekTo(at);
      if (!wasPlaying) rig.pause();
      rig.setRate(rate);
      rig.setVolume(volume);
      rigReady = true;
    } catch (error: unknown) {
      trouble =
        error instanceof Error
          ? `The video player could not be reached — ${error.message}.`
          : "The video player could not be reached.";
    }
    refresh();
  }

  const body = document.createElement("div");
  body.className = "playback-shell-body";
  shell.append(body);

  const playbackHost = document.createElement("div");
  const timingHost = document.createElement("div");
  timingHost.hidden = true;
  body.append(playbackHost, timingHost);

  const panel: PlaybackPanel = createPlaybackPanel(playbackHost, {
    onRate: (rate) => rig.setRate(rate),

    onVolume: (volume) => rig.setVolume(volume),

    onPlayPause: playPause,

    onLoop(on) {
      if (!section) return;
      section = setLooping(section, on);
      refresh();
    },

    onRestart: jumpBack,

    onResetMark(field) {
      if (!map) return;
      setMark(field, field === "start" ? map.start : map.end);
    },

    onType(field, seconds) {
      if (seconds === undefined) {
        // A playback bound always holds something; an emptied box comes back.
        refresh();
        return;
      }
      setMark(field, seconds, { announced: false });
    },

    onNudge(field, seconds) {
      const current = field === "start" ? sectionStart : sectionEnd;
      if (current === undefined) return;
      setMark(field, current + seconds, { announced: false });
    },

    onFromNote: fromNote,

    onMetronome(on) {
      metronomeOn = on && map !== undefined;
      // Inside the click, which is the only place sound may start from.
      rig.setMetronome(metronomeOn ? map : undefined);
      refresh();
    },

    onNotes: setNotes,

    onFollow(on) {
      followOn = on && map !== undefined;
      if (!followOn) playhead.show(undefined);
      refresh();
    },

    onLetter,
  }, { assist: options.assist !== undefined });

  // The player is fenced or not by mode, and the fence's click answers with
  // the play button — which is why this waits for the panel to exist.
  takeFrame(iframe);

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
          onVolume: (volume) => rig.setVolume(volume),
          onMetronome(on) {
            metronomeOn = on && map !== undefined;
            rig.setMetronome(metronomeOn ? map : undefined);
            refresh();
          },
          // No notes toggle: what is heard is a playback setting, and this
          // panel sets the timing. The choice keeps what the playback panel says.
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
      played = [];
      sendPlayalong();
      showBrackets();
      return;
    }
    const positions = eventPositions(melody);
    onsets = positions.map((position) =>
      secondsAtPosition(map!, position.start.toNumber()),
    );
    ends = positions.map((position) =>
      secondsAtPosition(map!, position.start.add(position.length).toNumber()),
    );
    // The one place whole notes become seconds. `soundingNotes` measures in the
    // melody's own units, which do not move when the marks do; these do.
    played = soundingNotes(melody).map((note) => ({
      start: secondsAtPosition(map!, note.start),
      end: secondsAtPosition(map!, note.end),
      midi: note.midi,
    }));
    sendPlayalong();
    // The gaps have moved even though the marks have not: a note written, or a
    // tempo corrected, puts every onset somewhere new.
    showBrackets();
  }

  /**
   * Hand the rig what to play, or nothing.
   *
   * Called again on every edit and every re-timing, both of which move the
   * notes: the rig drops whatever it had lined up, because those were the notes
   * as they stood a keystroke ago.
   */
  function sendPlayalong(): void {
    rig.setPlayalong(notesOn ? played : undefined);
  }

  /** Which event is sounding at a video second, or none outside the music. */
  function eventAt(seconds: number): number | undefined {
    if (!map) return undefined;
    if (seconds < map.start || seconds > map.end) return undefined;
    return eventAtSeconds(onsets, seconds);
  }

  refresh();

  return {
    unlockAssist() {
      if (!assistLocked) return;
      assistLocked = false;
      refresh();
    },

    follow(next) {
      takeOnsets(next);
    },

    onScore(rendered) {
      playhead.onScore(rendered);
      brackets.onScore(rendered);
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
      brackets.destroy();
      rig.destroy();
    },
  };
}
