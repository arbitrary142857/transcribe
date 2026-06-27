import { writeTone } from "../music/synthesis.js";
import type { Beat } from "./tempo-map.js";

/**
 * A click over the video.
 *
 * The clicks are rendered once with the project's own tone writer rather than
 * built out of oscillators and gain nodes, so there is one place in the codebase
 * that decides what a synthesised note sounds like.
 *
 * Nothing is done about output latency: the click and the video's own sound
 * leave by the same speakers, so whatever delay there is applies to both and
 * correcting for it would only push them apart.
 */
export type Metronome = {
  /**
   * Sound these beats.
   *
   * `videoNow` is where the video had got to when the beats were worked out, and
   * `rate` how fast it is running, which is all that is needed to turn a beat's
   * video-time into a moment of the audio clock.
   */
  schedule(beats: readonly Beat[], videoNow: number, rate: number): void;
  /** Drop everything lined up but not yet sounded. */
  silence(): void;
  close(): void;
};

/** Short and dry: a click, not a note. */
const CLICK_SECONDS = 0.035;

const DOWNBEAT_HZ = 1600;
const OFFBEAT_HZ = 1100;

function clickBuffer(context: AudioContext, frequency: number): AudioBuffer {
  const frames = Math.ceil(CLICK_SECONDS * context.sampleRate);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const samples = new Float32Array(frames);
  writeTone(samples, 0, frequency, CLICK_SECONDS, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

/**
 * Start a metronome.
 *
 * Call this from a click: a browser will not let a page make a sound until the
 * user has asked for one, and an `AudioContext` made anywhere else arrives
 * suspended and stays that way.
 */
export function createMetronome(): Metronome {
  const context = new AudioContext();
  const downbeat = clickBuffer(context, DOWNBEAT_HZ);
  const offbeat = clickBuffer(context, OFFBEAT_HZ);

  // Held on to so that a seek, a pause or a change of speed can take back
  // clicks that were lined up for a future that is no longer coming.
  let sounding: AudioBufferSourceNode[] = [];

  return {
    schedule(beats, videoNow, rate) {
      if (context.state === "suspended") {
        void context.resume();
      }
      const audioNow = context.currentTime;
      for (const beat of beats) {
        const at = audioNow + (beat.seconds - videoNow) / rate;
        // A beat already gone by is dropped rather than fired late: a click in
        // the wrong place is worse than a click missing.
        if (at < audioNow) continue;

        const source = context.createBufferSource();
        source.buffer = beat.accented ? downbeat : offbeat;
        source.connect(context.destination);
        source.addEventListener("ended", () => {
          sounding = sounding.filter((other) => other !== source);
        });
        source.start(at);
        sounding.push(source);
      }
    },

    silence() {
      for (const source of sounding) {
        // A source that has already finished throws rather than shrugging.
        try {
          source.stop();
        } catch {
          // Already done; nothing to take back.
        }
      }
      sounding = [];
    },

    close() {
      this.silence();
      void context.close();
    },
  };
}
