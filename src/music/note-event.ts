import { Duration } from "./duration.js";
import { Pitch } from "./pitch.js";

/** Staff position placeholder for rests (the pitch carries no meaning). */
const REST_PLACEHOLDER = "b4";

export type NoteEvent = Note | UnpitchedNote | Rest;

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

/**
 * A note whose rhythm is decided but whose pitch is not yet.
 *
 * This is what rhythm-first entry writes: the length is real music, the pitch is
 * still an open question, and neither a `Note` at some stand-in pitch nor a
 * `Rest` says that. A `Note` would claim a pitch was chosen, and would colour
 * the accidentals of the bar it sits in; a `Rest` would claim silence was.
 *
 * `Melody.setPitch` turns one into a `Note`, and `Melody.clearPitch` turns it
 * back. It sounds as silence until then, and `Melody.isFullyPitched` reports
 * whether any remain.
 */
export class UnpitchedNote {
  constructor(public duration: Duration) {}

  isEqual(other: NoteEvent): boolean {
    if (!(other instanceof UnpitchedNote)) {
      return false;
    }
    return this.duration.isEqual(other.duration);
  }

  isEnharmonicallyEqual(other: NoteEvent): boolean {
    if (!(other instanceof UnpitchedNote)) {
      return false;
    }
    return this.duration.sameLengthAs(other.duration);
  }

  /** Unpitched note token, e.g. `"x/q"`, after the notehead it is drawn with. */
  toString(): string {
    return `x${this.duration}`;
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
