import {
  readClock,
  sampleClock,
  startedClock,
  type ClockState,
} from "../playback/clock.js";
import { createMetronome, type Metronome } from "../playback/metronome.js";
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
  subscribe(listener: RigListener): () => void;
  destroy(): void;
};

export function createVideoRig(iframe: HTMLIFrameElement): VideoRig {
  let handle: PlayerHandle | undefined;
  let clock: ClockState | undefined;
  let metronome: Metronome | undefined;
  let map: TempoMap | undefined;
  let scheduledThrough = 0;
  let frame = 0;
  const listeners: RigListener[] = [];

  const now = (): number =>
    clock ? readClock(clock, performance.now()) : 0;

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
    if (!metronome || !map || !clock?.playing) return;
    const at = now();
    const until = at + HORIZON_SECONDS * clock.rate;
    // Never behind the moment: a window reaching into the past would ask for
    // clicks that have already been missed.
    const from = Math.max(scheduledThrough, at);
    if (until <= from) return;
    metronome.schedule(beatsBetween(map, from, until), at, clock.rate);
    scheduledThrough = until;
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
      handle?.destroy();
    },
  };
}
