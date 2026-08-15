/**
 * The piano the keyboard sounds.
 *
 * Rendered with the project's own tone writer rather than built out of
 * oscillator and gain nodes, for the reason the metronome gives: one place in
 * the codebase decides what a synthesised note sounds like. What is left here is
 * the part that has to be a browser's business — when a context may be made, not
 * rendering the same note twice, and stopping what is already sounding.
 *
 * Every note is a *voice*: a buffer, a gain to fade it with, and a handle to
 * hold on to. That last part is the whole design. A fire-and-forget
 * `source.start()` cannot be taken back, so notes could only ever pile up —
 * pitching a phrase quickly left five or six full-length tails ringing at once,
 * which is what a room sounds like. A voice can be damped, which is what the
 * felts on a real piano are for.
 *
 * It is also the shape the next thing needs. Playing back a transcription
 * against the video wants notes started at a time rather than now, each damped
 * at its own written end, and all of them droppable the instant the video is
 * paused or scrubbed. Those are `voice()`, `release()` and `silence()` — the
 * same three pieces, given times instead of "now".
 */

import { frequencyOfMidi } from "../music/pitch.js";
import { pianoToneSeconds, writePianoTone } from "../music/synthesis.js";

/**
 * A note to sound at a moment and let go at another, in **video seconds**.
 *
 * The same shape `soundingNotes` produces, which measures in whole notes
 * instead — the tempo map is what turns one into the other, and `playback.ts`
 * is the one place that does it.
 */
export type PianoNote = {
  readonly start: number;
  readonly end: number;
  readonly midi: number;
};

/** Where a note falls on the audio clock, and how much of it is left to play. */
export type VoiceTiming = {
  /** When it starts, on the audio clock. */
  readonly at: number;
  /** How far into the rendered tone to begin, in seconds. */
  readonly offset: number;
  /** When to let it go, on the audio clock. */
  readonly until: number;
};

/**
 * Turn one note of video into one note of sound.
 *
 * Two mappings, and the rate is in both. The *wait* is video seconds converted
 * to wall seconds — at half speed a note a beat away is two beats of waiting —
 * and the *length* likewise, which is why a note held through a slow passage
 * rings for longer. The tone itself is never stretched: it is rendered in real
 * time and played at its own speed, so the pitch does not follow the video's.
 *
 * A note whose start has gone is not dropped if it is still sounding. A click is
 * an instant and cannot be played late, but a note is a duration, and one under
 * way can be joined part-way through by beginning that far into the tone —
 * which is what is heard when the piano is switched on mid-phrase, and what
 * keeps the note under a section's start mark from being lost to the seek that
 * gets there.
 *
 * `undefined` for a note that is over, and for one with no length to it.
 */
export function voiceTiming(
  note: PianoNote,
  videoNow: number,
  rate: number,
  audioNow: number,
): VoiceTiming | undefined {
  if (note.end <= note.start) return undefined;

  const ahead = note.start - videoNow;
  if (ahead >= 0) {
    const at = audioNow + ahead / rate;
    return { at, offset: 0, until: at + (note.end - note.start) / rate };
  }

  if (note.end <= videoNow) return undefined;
  return {
    at: audioNow,
    offset: -ahead / rate,
    until: audioNow + (note.end - videoNow) / rate,
  };
}

export type Piano = {
  /**
   * Sound this key now, damping whatever the last press left ringing.
   *
   * One note at a time, because this is a keyboard being used to find a pitch
   * rather than to play a chord: the note before it is what would be in the way.
   */
  play(midi: number): void;
  /**
   * Line these notes up against the video's clock.
   *
   * `videoNow` is where the video had got to when they were worked out and
   * `rate` how fast it is running, which is all it takes to turn a moment of
   * video time into a moment of the audio clock. The same two arguments the
   * metronome takes, for the same reason.
   *
   * Unlike `play`, nothing is damped to make room: a melody's notes are damped
   * by their own written ends, which is what keeps a run of them from piling
   * into each other. A note handed over after it has begun is joined part-way
   * through rather than dropped — see `voiceTiming`.
   */
  schedule(notes: readonly PianoNote[], videoNow: number, rate: number): void;
  /** Drop everything sounding or lined up, at once. */
  silence(): void;
  close(): void;
};

/**
 * How many rendered notes to keep.
 *
 * A note is a couple of seconds of mono float samples — a few hundred kilobytes
 * — so the whole clef's range held at once would be tens of megabytes for a
 * convenience. Two octaves' worth covers the going back and forth of pitching a
 * phrase, and anything past that is quick enough to render again.
 */
const KEPT = 24;

/**
 * How long a damped note takes to fall silent, in seconds.
 *
 * Long enough not to click, short enough that the note replacing it is heard on
 * its own. A piano damper is about this quick.
 */
const RELEASE_SECONDS = 0.14;

/** A note that is sounding or lined up, and the gain that can take it away. */
type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** When it starts on the audio clock — a scheduled note has not yet. */
  startedAt: number;
};

export function createPiano(): Piano {
  // Made on the first press, never before: a browser will not let a page make a
  // sound until the user has asked for one, and a context made anywhere else
  // arrives suspended and stays that way. The same rule `createMetronome`
  // follows, except that this one cannot be made when its owner is built —
  // building the editor is not a gesture.
  let context: AudioContext | undefined;
  const rendered = new Map<number, AudioBuffer>();
  let sounding: Voice[] = [];

  function bufferFor(midi: number, ctx: AudioContext): AudioBuffer {
    const kept = rendered.get(midi);
    if (kept) return kept;

    const frequency = frequencyOfMidi(midi);
    const seconds = pianoToneSeconds(frequency);
    const buffer = ctx.createBuffer(
      1,
      Math.ceil(seconds * ctx.sampleRate),
      ctx.sampleRate,
    );
    const samples = new Float32Array(buffer.length);
    writePianoTone(samples, 0, frequency, seconds, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);

    // Oldest out first, which for this is also least recently asked for: a
    // note played again is served from the map without being re-inserted, and
    // the notes being worked on are the ones being played.
    if (rendered.size >= KEPT) {
      const oldest = rendered.keys().next();
      if (!oldest.done) rendered.delete(oldest.value);
    }
    rendered.set(midi, buffer);
    return buffer;
  }

  /**
   * Start a note, at `when` on the audio clock.
   *
   * `offset` begins that far into the tone rather than at its head, which is
   * how a note already under way is joined: the attack has been and gone, and
   * what is left is the decay it would be in the middle of.
   */
  function voice(
    midi: number,
    ctx: AudioContext,
    when: number,
    offset = 0,
  ): Voice {
    const source = ctx.createBufferSource();
    source.buffer = bufferFor(midi, ctx);

    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);

    const started: Voice = { source, gain, startedAt: when };
    source.addEventListener("ended", () => {
      sounding = sounding.filter((other) => other !== started);
      gain.disconnect();
    });
    source.start(when, offset);
    return started;
  }

  /**
   * The context, made and woken on the way to making a sound.
   *
   * Never before: a browser will not let a page make a sound until the user has
   * asked for one, and a context made anywhere else arrives suspended and stays
   * that way. Every route into this file runs inside a press.
   */
  function waking(): AudioContext {
    context ??= new AudioContext();
    if (context.state === "suspended") {
      void context.resume();
    }
    return context;
  }

  /** Fade a voice out and stop it, the way a damper falls on a string. */
  function release({ source, gain }: Voice, at: number): void {
    const until = at + RELEASE_SECONDS;
    // Cancelled first, or a ramp already scheduled would go on fighting this
    // one. `setValueAtTime` pins where the fade starts from, since an
    // exponential ramp needs somewhere to begin.
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(gain.gain.value, at);
    // Linear rather than exponential: an exponential ramp cannot reach zero,
    // and the tail being cut is already quiet.
    gain.gain.linearRampToValueAtTime(0, until);
    try {
      source.stop(until);
    } catch {
      // Already finished on its own, which is the ordinary case for a note left
      // to ring out.
    }
  }

  return {
    play(midi) {
      const ctx = waking();
      const now = ctx.currentTime;
      for (const other of sounding) {
        release(other, now);
      }
      sounding = [voice(midi, ctx, now)];
    },

    schedule(notes, videoNow, rate) {
      if (notes.length === 0) return;
      const ctx = waking();
      const audioNow = ctx.currentTime;

      for (const note of notes) {
        const timing = voiceTiming(note, videoNow, rate, audioNow);
        // Nothing left of it: over before this window opened, or written with
        // no length at all.
        if (!timing) continue;

        const started = voice(note.midi, ctx, timing.at, timing.offset);
        sounding.push(started);
        // Damped at its own written end, so the melody's own rhythm decides how
        // long each note rings rather than the buffer's full decay.
        release(started, timing.until);
      }
    },

    silence() {
      if (!context) return;
      const now = context.currentTime;
      for (const other of sounding) {
        // Anything already lined up for a future that is no longer coming is
        // stopped outright rather than faded: there is nothing to fade from
        // until it starts, and a ramp scheduled before its own source would
        // let it sound at full volume when its moment arrived.
        if (other.startedAt > now) {
          try {
            other.source.stop(now);
          } catch {
            // Never started and never will; nothing to take back.
          }
          other.gain.disconnect();
          continue;
        }
        release(other, now);
      }
      sounding = [];
    },

    close() {
      sounding = [];
      rendered.clear();
      void context?.close();
      context = undefined;
    },
  };
}
