import { Duration } from "./duration.js";
import { Fraction } from "./fraction.js";
import { findTiedChain } from "./tieChain.js";
import { KeySignature } from "./key-signature.js";
import { Note, type NoteEvent, Rest } from "./note-event.js";
import { Pitch } from "./pitch.js";
import { SAMPLE_RATE, writeTone } from "./synthesis.js";
import { Tuplet, type TupletSpan } from "./tuplet.js";
import type { TimeSignature } from "./types.js";
import { encodeWav } from "./wav.js";

const ZERO = new Fraction(0, 1);

/**
 * Whether a length can be notated without a tuplet, i.e. its denominator is a
 * power of two. A complete tuplet always sounds for such a length: three
 * eighth-note triplets fill a quarter, five sixteenth quintuplets fill a
 * quarter. Any shorter run leaves a denominator the ratio never divides out.
 */
function isWritableWithoutTuplet(length: Fraction): boolean {
  const { den } = length;
  return (den & (den - 1)) === 0;
}

export class Melody {
  private events: NoteEvent[];
  private tiedToNext = new Set<number>();
  private tuplets = new Map<number, { count: number; tuplet: Tuplet }>();

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

  /**
   * Group `count` consecutive events under one tuplet bracket. The ratio is read
   * from the events' own durations, which must all carry the same one, and the
   * group must be complete — it must sound for a length writable without the
   * tuplet. Grouping only records how events are bracketed, never alters one.
   */
  groupTuplet(startIndex: number, count: number): void {
    if (!Number.isInteger(count) || count < 2) {
      throw new RangeError("count must be an integer greater than 1");
    }
    if (startIndex < 0 || startIndex + count > this.eventCount) {
      throw new RangeError(
        `Cannot group ${count} events into a tuplet at index ${startIndex}: the melody has ${this.eventCount} events`,
      );
    }

    const tuplet = this.getEvent(startIndex).duration.tuplet;
    if (tuplet.isNone()) {
      throw new TypeError(
        `Cannot group a tuplet at index ${startIndex}: the event has no tuplet duration`,
      );
    }

    let total = ZERO;
    for (let i = startIndex; i < startIndex + count; i++) {
      if (!this.getEvent(i).duration.tuplet.isEqual(tuplet)) {
        throw new TypeError(
          `Cannot group a tuplet at index ${startIndex}: event ${i} does not have the same tuplet ratio`,
        );
      }
      if (!this.getTupletSpan(i).tuplet.isNone()) {
        throw new RangeError(
          `Cannot group a tuplet at index ${startIndex}: event ${i} is already in a tuplet`,
        );
      }
      total = total.add(this.getEvent(i).duration.asWholeNoteFraction());
    }

    if (!isWritableWithoutTuplet(total)) {
      throw new RangeError(
        `Cannot group a tuplet at index ${startIndex}: the ${tuplet} group is incomplete, sounding ${total} of a whole note`,
      );
    }

    this.tuplets.set(startIndex, { count, tuplet });
  }

  ungroupTuplet(startIndex: number): void {
    this.tuplets.delete(startIndex);
  }

  /**
   * The tuplet span containing `index`; a lone span of `Tuplet.None` when the
   * event is not grouped with any other.
   */
  getTupletSpan(index: number): TupletSpan {
    this.assertEventIndex(index);
    for (const [start, { count, tuplet }] of this.tuplets) {
      if (index >= start && index < start + count) {
        return { start, count, tuplet };
      }
    }
    return { start: index, count: 1, tuplet: Tuplet.None };
  }

  /** Every grouped tuplet span, ordered by start index. */
  tupletSpans(): TupletSpan[] {
    return [...this.tuplets]
      .map(([start, { count, tuplet }]) => ({ start, count, tuplet }))
      .sort((a, b) => a.start - b.start);
  }

  setDuration(index: number, duration: Duration): void {
    const event = this.getEvent(index);
    const { tuplet } = this.getTupletSpan(index);
    if (!tuplet.isNone() && !duration.tuplet.isEqual(tuplet)) {
      throw new TypeError(
        `Cannot set duration at index ${index}: the event is grouped in a ${tuplet} tuplet`,
      );
    }
    this.events[index] =
      event instanceof Note
        ? new Note(event.pitch, duration)
        : new Rest(duration);
  }

  private sameTupletSpans(other: Melody): boolean {
    const mine = this.tupletSpans();
    const theirs = other.tupletSpans();
    return (
      mine.length === theirs.length &&
      mine.every((span, i) => {
        const otherSpan = theirs[i]!;
        return (
          span.start === otherSpan.start &&
          span.count === otherSpan.count &&
          span.tuplet.isEqual(otherSpan.tuplet)
        );
      })
    );
  }

  /**
   * Shared shape of both equality methods: meter, tie and tuplet structure are
   * always compared exactly, while the key and the events are compared by the
   * given predicates.
   */
  private matches(
    other: Melody,
    keysMatch: (a: KeySignature, b: KeySignature) => boolean,
    eventsMatch: (a: NoteEvent, b: NoteEvent) => boolean,
  ): boolean {
    if (!keysMatch(this.keySignature, other.keySignature)) {
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
    if (!this.sameTupletSpans(other)) {
      return false;
    }
    for (let i = 0; i < this.eventCount; i++) {
      if (!eventsMatch(this.getEvent(i), other.getEvent(i))) {
        return false;
      }
      if (this.isTiedToNext(i) !== other.isTiedToNext(i)) {
        return false;
      }
    }
    return true;
  }

  isEqual(other: Melody): boolean {
    return this.matches(
      other,
      (a, b) => a.isEqual(b),
      (a, b) => a.isEqual(b),
    );
  }

  isEnharmonicallyEqual(other: Melody): boolean {
    return this.matches(
      other,
      (a, b) => a.isEnharmonicallyEqual(b),
      (a, b) => a.isEnharmonicallyEqual(b),
    );
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

  /** Comma-separated note and rest tokens. */
  toString(): string {
    const parts: string[] = [];
    for (let i = 0; i < this.eventCount; i++) {
      parts.push(this.getEvent(i).toString());
    }
    return parts.join(", ");
  }
}
