import { Duration } from "./duration.js";
import { KeySignature } from "./key-signature.js";
import { Note, type NoteEvent, Rest } from "./note-event.js";
import { Pitch } from "./pitch.js";
import { SAMPLE_RATE, writeTone } from "./synthesis.js";
import type { TimeSignature } from "./types.js";
import { encodeWav } from "./wav.js";

export class Melody {
  private events: NoteEvent[];

  constructor(
    public readonly keySignature: KeySignature,
    public readonly timeSignature: TimeSignature,
    events: readonly NoteEvent[],
  ) {
    this.events = [...events];
  }

  get eventCount(): number {
    return this.events.length;
  }

  getEvent(index: number): NoteEvent {
    const event = this.events[index];
    if (!event) {
      throw new RangeError(`No event at index ${index}`);
    }
    return event;
  }

  setPitch(index: number, pitch: Pitch): void {
    const event = this.getEvent(index);
    if (!(event instanceof Note)) {
      throw new TypeError("Cannot set pitch on a rest");
    }
    this.events[index] = new Note(pitch, event.duration);
  }

  setDuration(index: number, duration: Duration): void {
    const event = this.getEvent(index);
    this.events[index] =
      event instanceof Note
        ? new Note(event.pitch, duration)
        : new Rest(duration);
  }

  isEqual(other: Melody): boolean {
    if (!this.keySignature.isEqual(other.keySignature)) {
      return false;
    }
    if (
      this.timeSignature.beats !== other.timeSignature.beats ||
      this.timeSignature.beatUnit !== other.timeSignature.beatUnit
    ) {
      return false;
    }
    if (this.eventCount !== other.eventCount) {
      return false;
    }
    for (let i = 0; i < this.eventCount; i++) {
      if (!this.getEvent(i).isEqual(other.getEvent(i))) {
        return false;
      }
    }
    return true;
  }

  isEnharmonicallyEqual(other: Melody): boolean {
    if (!this.keySignature.isEnharmonicallyEqual(other.keySignature)) {
      return false;
    }
    if (
      this.timeSignature.beats !== other.timeSignature.beats ||
      this.timeSignature.beatUnit !== other.timeSignature.beatUnit
    ) {
      return false;
    }
    if (this.eventCount !== other.eventCount) {
      return false;
    }
    for (let i = 0; i < this.eventCount; i++) {
      if (!this.getEvent(i).isEnharmonicallyEqual(other.getEvent(i))) {
        return false;
      }
    }
    return true;
  }

  /** WAV file bytes (44.1 kHz, mono, 16-bit PCM) at the given quarter-note bpm. */
  playback(bpm: number): Uint8Array {
    if (bpm <= 0) {
      throw new RangeError("bpm must be positive");
    }

    let totalSeconds = 0;
    for (let i = 0; i < this.eventCount; i++) {
      totalSeconds += this.getEvent(i).duration.inSeconds(bpm);
    }

    const samples = new Float32Array(Math.ceil(totalSeconds * SAMPLE_RATE));
    let offsetSeconds = 0;

    for (let i = 0; i < this.eventCount; i++) {
      const event = this.getEvent(i);
      const durationSeconds = event.duration.inSeconds(bpm);

      if (event instanceof Note) {
        writeTone(
          samples,
          Math.round(offsetSeconds * SAMPLE_RATE),
          event.pitch.toFrequency(),
          durationSeconds,
        );
      }

      offsetSeconds += durationSeconds;
    }

    return encodeWav(samples, SAMPLE_RATE);
  }
}
