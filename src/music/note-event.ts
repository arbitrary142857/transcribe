import { Duration, vexflowDurationSlash } from "./duration.js";
import { Pitch } from "./pitch.js";

/** Staff position placeholder for EasyScore rests (VexFlow ignores the pitch). */
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

  /** EasyScore note token, e.g. `"e4/q"` or `"f#4/h."`. */
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

  /** EasyScore rest token, e.g. `"b4/q/r"` or `"b4/h/r.."`. */
  toString(): string {
    return `${REST_PLACEHOLDER}${vexflowDurationSlash(this.duration.value)}/r${".".repeat(this.duration.dots)}`;
  }
}
