import {
  readClock,
  sampleClock,
  startedClock,
  type ClockState,
} from "../playback/clock.js";
import { createMetronome, type Metronome } from "../playback/metronome.js";
import { createPiano, type Piano, type PianoNote } from "../playback/piano.js";
import { heldAt, notesBetween } from "../playback/playalong.js";
import type { PlayerLife } from "../playback/section-play.js";
import { beatsBetween, type TempoMap } from "../playback/tempo-map.js";
import { adoptPlayer, type PlayerHandle } from "./youtube-player.js";

/** How far ahead of the speakers the metronome lines its clicks up, in wall seconds. */
const HORIZON_SECONDS = 0.4;

/** How often the interval loop runs — the metronome and the fallback ticks. */
const TICK_MS = 100;

/**
 * What the rig tells whoever is listening.
 *
 * `onJump` fires only when the reading itself moved somewhere it could not have
 * got to by playing — a seek — and never for pauses or speed changes, which
 * arrive as their own facts. That separation is load-bearing: section playback
 * treats an unexplained seek as the user grabbing the scrubber, and would
 * otherwise let go of the video every time the speed slider moved.
 */
export type RigListener = {
  onTick?(now: number, wall: number): void;
  /** A seek: the reading is somewhere it could not have got to by playing. */
  onJump?(to: number, wall: number): void;
  onLife?(life: PlayerLife, now: number, wall: number): void;
  onRate?(rate: number): void;
};

/**
 * One video, one clock, one metronome — the part of playback both pages share.
 *
 * The rig owns the timers. Time is pumped on every animation frame for
 * smoothness, and again on a steady interval because a background tab freezes
 * its animation frames while the video plays on — the interval is what keeps
 * the clock, the ticks and the metronome honest when nobody is looking.
 */
export type VideoRig = {
  /** Resolves once the player answers; rejects with what went wrong. */
  readonly ready: Promise<void>;
  /** Video seconds at this instant. */
  now(): number;
  playing(): boolean;
  rate(): number;
  rates(): readonly number[];
  setRate(rate: number): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  /** The video's length, or 0 while it is not yet known. */
  duration(): number;
  /**
   * Click along `map`, or stop clicking with `undefined`.
   *
   * The first call with a map must come from inside a user gesture: the audio
   * context is created here and nowhere else, and a browser only allows sound
   * to start from a click.
   */
  setMetronome(map: TempoMap | undefined): void;
  /**
   * Play these notes along with the video, or stop with `undefined`.
   *
   * The seconds are video seconds, so the caller re-hands them whenever the
   * melody or the tempo moves; handing them over drops whatever was lined up
   * from the reading before. Like the metronome, the first call carrying notes
   * must come from inside a user gesture.
   */
  setPlayalong(notes: readonly PianoNote[] | undefined): void;
  /** Silence the video itself, for hearing the transcription on its own. */
  setMuted(muted: boolean): void;
  subscribe(listener: RigListener): () => void;
  destroy(): void;
};

export function createVideoRig(iframe: HTMLIFrameElement): VideoRig {
  let handle: PlayerHandle | undefined;
  let clock: ClockState | undefined;
  let metronome: Metronome | undefined;
  let map: TempoMap | undefined;
  let scheduledThrough = 0;

  let piano: Piano | undefined;
  let playalong: readonly PianoNote[] | undefined;
  /** The playalong's own watermark: the two are switched on independently. */
  let playedThrough = 0;
  /**
   * Whether the note already sounding is still owed.
   *
   * Set wherever the watermark falls back to the present — a seek, a pause, a
   * change of speed, a new melody, the piano being switched on — because that
   * is the only time a window can open in the middle of a note. In steady
   * running the watermark is a horizon *ahead* of now, so nothing that has
   * already begun ever falls inside one.
   */
  let catchUp = false;
  let frame = 0;
  const listeners: RigListener[] = [];

  const now = (): number =>
    clock ? readClock(clock, performance.now()) : 0;

  /**
   * Take up the note the line was picked up in the middle of, if there is one.
   *
   * Spent from the scheduler rather than from `pump`, deliberately. A single
   * seek arrives as two or three separate discontinuities — the reading moving,
   * then the player saying it stopped, then that it started — and each of them
   * re-arms this. Spending it inside `pump` therefore took the note up once per
   * discontinuity, and since `silence()` fades an already-sounding voice over
   * `RELEASE_SECONDS` rather than cutting it, what came out was the note, an
   * audible damped tail, and the note again a flam later.
   */
  function catchUpAt(at: number, rate: number): void {
    if (!catchUp || !piano || !playalong) return;
    catchUp = false;
    const held = heldAt(playalong, at);
    if (held) piano.schedule([held], at, rate);
  }

  /** One sampling pass: advance the clock, report what changed. */
  function pump(): void {
    if (!handle || !clock) return;
    const sample = handle.sample();
    const stepped = sampleClock(clock, sample);
    clock = stepped.state;
    const at = readClock(clock, sample.wall);

    if (stepped.jumped) {
      // Whatever was scheduled was scheduled for a future that is no longer
      // coming — a seek, a pause, a change of speed all break the line.
      metronome?.silence();
      scheduledThrough = at;
      // Only what the new reading has actually left behind. A note the reading
      // is still inside is the same note it was, and survives — which is what
      // keeps the player's own backward slip, a few tens of milliseconds after
      // any resume and indistinguishable here from a small seek, from silencing
      // a note that is sounding perfectly well.
      const holding = piano?.relocate(at, clock.rate) ?? false;
      playedThrough = at;
      // Landing mid-note is the ordinary case for a seek, a loop wrap and a
      // resume, and the note being landed in is owed rather than lost — unless
      // it is the one still ringing, which is owed nothing.
      if (!holding) catchUp = true;
    }
    if (stepped.moved) {
      for (const listener of listeners) listener.onJump?.(at, sample.wall);
    }
    for (const listener of listeners) listener.onTick?.(at, sample.wall);
  }

  function tickFrame(): void {
    frame = requestAnimationFrame(tickFrame);
    pump();
  }

  const scheduler = setInterval(() => {
    pump();
    if (!clock?.playing) return;
    const at = now();
    // The horizon is wall time, so at half speed it reaches half as far into
    // the video — which is what keeps the lead time the same however fast the
    // video runs.
    const until = at + HORIZON_SECONDS * clock.rate;

    if (metronome && map) {
      // Never behind the moment: a window reaching into the past would ask for
      // clicks that have already been missed.
      const from = Math.max(scheduledThrough, at);
      if (until > from) {
        metronome.schedule(beatsBetween(map, from, until), at, clock.rate);
        scheduledThrough = until;
      }
    }

    // Its own watermark, because the two are switched on and off separately
    // and one of them starting must not skip the other past a window.
    if (piano && playalong) {
      const from = Math.max(playedThrough, at);
      // The note the line was picked up in the middle of. Asked about `at`
      // rather than `from`, and answered strictly, so a note beginning exactly
      // on the seam belongs to the window below and is never sounded by both.
      catchUpAt(at, clock.rate);
      if (until > from) {
        piano.schedule(notesBetween(playalong, from, until), at, clock.rate);
        playedThrough = until;
      }
    }
  }, TICK_MS);

  const ready = adoptPlayer(iframe).then((adopted) => {
    handle = adopted;
    clock = startedClock(adopted.sample());
    adopted.onLife((life) => {
      // Sample first, so the clock has already taken the change in before
      // anyone is told about it, and `now` is read from the settled clock.
      pump();
      const wall = performance.now();
      const at = readClock(clock!, wall);
      for (const listener of listeners) listener.onLife?.(life, at, wall);
    });
    adopted.onRate((rate) => {
      pump();
      for (const listener of listeners) listener.onRate?.(rate);
    });
    frame = requestAnimationFrame(tickFrame);
  });

  return {
    ready,
    now,
    playing: () => clock?.playing ?? false,
    rate: () => clock?.rate ?? 1,
    rates: () => handle?.rates() ?? [1],
    setRate: (rate) => handle?.setRate(rate),
    play: () => handle?.play(),
    pause: () => handle?.pause(),
    seekTo: (seconds) => handle?.seekTo(seconds),
    duration: () => handle?.duration() ?? 0,

    setMetronome(next) {
      map = next;
      if (next) {
        // Made here, in the caller's own click, and only once.
        metronome ??= createMetronome();
        scheduledThrough = now();
      } else {
        metronome?.silence();
      }
    },

    setPlayalong(notes) {
      playalong = notes;
      // Whatever was lined up was lined up from a reading of the melody that
      // has just been replaced. Dropped rather than left to sound: a note
      // scheduled a keystroke ago is a note that is no longer written.
      piano?.silence();
      if (notes) {
        piano ??= createPiano();
        // Written ahead of being wanted. The note with the least warning — the
        // one under a section's start mark, taken up the instant a loop wraps —
        // is the one that cannot afford to have its tone written for it, and
        // this is the one place that knows the whole melody.
        piano.prepare(notes);
        playedThrough = now();
        // Whatever is written where the video already stands is owed: switching
        // the piano on mid-phrase picks that note up part-way through rather
        // than waiting for the next one, and an edit made while it plays no
        // longer leaves a hole where the held note was.
        catchUp = true;
      }
    },

    setMuted: (muted) => handle?.setMuted(muted),

    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },

    destroy() {
      cancelAnimationFrame(frame);
      clearInterval(scheduler);
      metronome?.close();
      piano?.close();
      handle?.destroy();
    },
  };
}
