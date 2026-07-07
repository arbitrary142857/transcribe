import { Duration } from "./duration.js";
import { findTiedChain } from "./tieChain.js";
import { KeySignature } from "./key-signature.js";
import { Note, type NoteEvent, Rest } from "./note-event.js";
import { Pitch } from "./pitch.js";
import { SAMPLE_RATE, writeTone } from "./synthesis.js";
import type { TimeSignature } from "./types.js";
import { encodeWav } from "./wav.js";

export class Melody {
  private events: NoteEvent[];
  private tiedToNext = new Set<number>();

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

  private assertEventIndex(index: number): void {
    if (index < 0 || index >= this.eventCount) {
      throw new RangeError(`No event at index ${index}`);
    }
  }

  getEvent(index: number): NoteEvent {
    this.assertEventIndex(index);
    return this.events[index]!;
  }

  setPitch(index: number, pitch: Pitch): void {
    const event = this.getEvent(index);
    if (!(event instanceof Note)) {
      throw new TypeError("Cannot set pitch on a rest");
    }
    for (const i of this.getTiedGroup(index)) {
      const member = this.getEvent(i);
      if (member instanceof Note) {
        this.events[i] = new Note(pitch, member.duration);
      }
    }
  }

  tie(index: number): void {
    if (index < 0 || index >= this.eventCount - 1) {
      throw new RangeError(
        `Cannot tie at index ${index}: index + 1 must be a valid event index`,
      );
    }

    const current = this.getEvent(index);
    const next = this.getEvent(index + 1);

    if (!(current instanceof Note)) {
      throw new TypeError("Cannot tie a rest to another event");
    }
    if (!(next instanceof Note)) {
      throw new TypeError("Cannot tie a note to a rest");
    }
    if (!current.pitch.isEqual(next.pitch)) {
      throw new TypeError(
        "Cannot tie notes with different pitches: pitches must match exactly",
      );
    }

    this.tiedToNext.add(index);
  }

  untie(index: number): void {
    this.tiedToNext.delete(index);
  }

  isTiedToNext(index: number): boolean {
    this.assertEventIndex(index);
    return this.tiedToNext.has(index);
  }

  isTiedToPrev(index: number): boolean {
    this.assertEventIndex(index);
    return this.tiedToNext.has(index - 1);
  }

  getTiedGroup(index: number): number[] {
    this.assertEventIndex(index);
    return findTiedChain(this.tiedToNext, index);
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
      if (this.isTiedToNext(i) !== other.isTiedToNext(i)) {
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
      if (this.isTiedToNext(i) !== other.isTiedToNext(i)) {
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

  /** EasyScore line of comma-separated note and rest tokens. */
  toString(): string {
    const parts: string[] = [];
    for (let i = 0; i < this.eventCount; i++) {
      parts.push(this.getEvent(i).toString());
    }
    return parts.join(", ");
  }
}
