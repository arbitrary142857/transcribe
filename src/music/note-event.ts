import { Duration } from "./duration.js";
import { Pitch } from "./pitch.js";

export type NoteEvent = Note | Rest;

export class Note {
  constructor(
    public pitch: Pitch,
    public duration: Duration,
  ) {}

  isEqual(other: NoteEvent): boolean {
    if (!(other instanceof Note)) {
      return false;
    }
    return (
      this.pitch.isEqual(other.pitch) && this.duration.isEqual(other.duration)
    );
  }

  isEnharmonicallyEqual(other: NoteEvent): boolean {
    if (!(other instanceof Note)) {
      return false;
    }
    return (
      this.pitch.isEnharmonicallyEqual(other.pitch) &&
      this.duration.sameLengthAs(other.duration)
    );
  }
}

export class Rest {
  constructor(public duration: Duration) {}

  isEqual(other: NoteEvent): boolean {
    if (!(other instanceof Rest)) {
      return false;
    }
    return this.duration.isEqual(other.duration);
  }

  isEnharmonicallyEqual(other: NoteEvent): boolean {
    if (!(other instanceof Rest)) {
      return false;
    }
    return this.duration.sameLengthAs(other.duration);
  }
}
