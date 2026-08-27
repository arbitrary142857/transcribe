import type { ClockSample } from "../playback/clock.js";
import type { PlayerLife } from "../playback/section-play.js";

/**
 * The little of YouTube's player API this page uses.
 *
 * Declared here rather than pulled in as a dependency: a handful of methods
 * and two events is the whole of it, and a type package would be more to keep
 * current than the thing it describes.
 */
type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  setPlaybackRate(rate: number): void;
  playVideo(): void;
  pauseVideo(): void;
  getVolume(): number;
  setVolume(volume: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
};

type YTEvent = { data: number; target: YTPlayer };

type YTNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: {
      events?: {
        onReady?: (event: YTEvent) => void;
        onStateChange?: (event: YTEvent) => void;
        onPlaybackRateChange?: (event: YTEvent) => void;
        onError?: (event: YTEvent) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { PLAYING: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * The player's numeric states, as transport truths.
 *
 * Unstarted (-1) and cued (5) are left out on purpose: they say what the
 * player has loaded, not what anyone asked it to do, and announcing them as
 * transport events would read as a user touching the controls.
 */
const LIFE_OF: Record<number, PlayerLife> = {
  0: "ended",
  1: "playing",
  2: "paused",
  3: "buffering",
};

/** How long to wait for the player to answer before giving up on it. */
const READY_TIMEOUT_MS = 10_000;

export type PlayerHandle = {
  /** What the player says at this instant. */
  sample(): ClockSample;
  life(): PlayerLife;
  /** The speeds this video can be played at, slowest first. */
  rates(): readonly number[];
  /** Ask for a speed. The player may pick a neighbouring one instead. */
  setRate(rate: number): void;
  /** The video's length in seconds, or 0 while it is not yet known. */
  duration(): number;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  /**
   * How loud the video speaks, 0 to 100.
   *
   * There is no event for it: a request rather than a state, held by whoever
   * holds the slider.
   */
  volume(): number;
  setVolume(volume: number): void;
  /** Transport changes — including ones made from YouTube's own controls. */
  onLife(listener: (life: PlayerLife) => void): void;
  /** The speed changed — including from YouTube's own settings menu. */
  onRate(listener: (rate: number) => void): void;
  destroy(): void;
};

let apiLoading: Promise<YTNamespace> | undefined;

/**
 * Fetch YouTube's player API, once for the life of the page.
 *
 * The API announces itself by calling a global, so there is exactly one of these
 * whatever asks for it.
 */
function loadApi(): Promise<YTNamespace> {
  if (apiLoading) {
    return apiLoading;
  }
  apiLoading = new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const timer = setTimeout(
      () => reject(new Error("YouTube's player API did not load")),
      READY_TIMEOUT_MS,
    );
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error("YouTube's player API loaded without a player"));
      }
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("YouTube's player API could not be fetched"));
    });
    document.head.append(tag);
  });
  return apiLoading;
}

/**
 * Take control of the player already on the page.
 *
 * Built over the existing iframe rather than in place of it, so the video keeps
 * playing across everything the page does around it. The embed carries
 * `enablejsapi`; without it this resolves to a player that answers nothing,
 * which is why the wait below has an end to it.
 */
export async function adoptPlayer(
  iframe: HTMLIFrameElement,
): Promise<PlayerHandle> {
  const YT = await loadApi();

  const lifeListeners: ((life: PlayerLife) => void)[] = [];
  const rateListeners: ((rate: number) => void)[] = [];

  let life: PlayerLife = "paused";
  let rate = 1;

  const player = await new Promise<YTPlayer>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The video player did not answer")),
      READY_TIMEOUT_MS,
    );
    const made = new YT.Player(iframe, {
      events: {
        onReady: () => {
          clearTimeout(timer);
          rate = made.getPlaybackRate();
          resolve(made);
        },
        onStateChange: (event) => {
          const next = LIFE_OF[event.data];
          if (next === undefined) return;
          life = next;
          for (const listener of lifeListeners) listener(next);
        },
        // The speed is read back rather than assumed: `setPlaybackRate` only
        // suggests, and YouTube's own settings menu can change it behind us.
        onPlaybackRateChange: (event) => {
          rate = event.data;
          for (const listener of rateListeners) listener(rate);
        },
      },
    });
  });

  return {
    sample: () => ({
      wall: performance.now(),
      reading: player.getCurrentTime(),
      rate,
      playing: life === "playing",
    }),
    life: () => life,
    rates: () => player.getAvailablePlaybackRates(),
    setRate: (next) => player.setPlaybackRate(next),
    duration: () => player.getDuration(),
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    seekTo: (seconds) => player.seekTo(seconds, true),
    volume: () => player.getVolume(),
    setVolume: (volume) =>
      player.setVolume(Math.max(0, Math.min(100, Math.round(volume)))),
    onLife: (listener) => lifeListeners.push(listener),
    onRate: (listener) => rateListeners.push(listener),
    destroy: () => player.destroy(),
  };
}
