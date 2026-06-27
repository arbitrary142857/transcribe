import { Duration } from "./duration.js";
import { Pitch } from "./pitch.js";

/** Staff position placeholder for rests (the pitch carries no meaning). */
const REST_PLACEHOLDER = "b4";

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

  /** Note token, e.g. `"e4/q"`, `"f#4/h."`, or `"c5/8{3:2}"`. */
  toString(): string {
    return `${this.pitch}${this.duration}`;
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

  /** Rest token, e.g. `"b4/q/r"`, `"b4/h../r"`, or `"b4/8{3:2}/r"`. */
  toString(): string {
    return `${REST_PLACEHOLDER}${this.duration}/r`;
  }
}
