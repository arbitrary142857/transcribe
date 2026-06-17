import { Duration } from "./duration.js";
import { KeySignature } from "./key-signature.js";
import { Note, type NoteEvent, Rest } from "./note-event.js";
import { Pitch } from "./pitch.js";
import type { TimeSignature } from "./types.js";

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
}
