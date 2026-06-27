import { Duration } from "./duration.js";
import { Fraction } from "./fraction.js";
import { findTiedChain } from "./tieChain.js";
import { KeySignature } from "./key-signature.js";
import { Note, type NoteEvent, Rest, UnpitchedNote } from "./note-event.js";
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
    if (this.getEvent(index) instanceof Rest) {
      throw new TypeError("Cannot set pitch on a rest");
    }
    for (const i of this.getTiedGroup(index)) {
      const member = this.getEvent(i);
      if (!(member instanceof Rest)) {
        this.events[i] = new Note(pitch, member.duration);
      }
    }
  }

  /**
   * Return a note to awaiting a pitch, keeping its rhythm.
   *
   * Applied to the whole tied group like `setPitch`, since a tied run is one
   * sound and so is pitched or unpitched as a whole.
   */
  clearPitch(index: number): void {
    if (this.getEvent(index) instanceof Rest) {
      throw new TypeError("Cannot clear the pitch of a rest");
    }
    for (const i of this.getTiedGroup(index)) {
      const member = this.getEvent(i);
      if (!(member instanceof Rest)) {
        this.events[i] = new UnpitchedNote(member.duration);
      }
    }
  }

  /** Whether every note has a pitch, so the melody is finished enough to save. */
  isFullyPitched(): boolean {
    return !this.events.some((event) => event instanceof UnpitchedNote);
  }

  /**
   * Replace one event, leaving the structure around it standing.
   *
   * Swapping an event for another of the same length is not restructuring, so
   * the tuplet bracket it belongs to and the ties either side of it survive —
   * unlike `replaceEvents`, which has to assume the worst. Only ties the new
   * event cannot honour are dropped, since a tie asserts two events are one
   * sound and silence can never be part of one.
   */
  setEvent(index: number, event: NoteEvent): void {
    this.assertEventIndex(index);
    this.events[index] = event;

    for (const tieIndex of [index - 1, index]) {
      if (tieIndex >= 0 && tieIndex < this.eventCount - 1 && !this.canTie(tieIndex)) {
        this.tiedToNext.delete(tieIndex);
      }
    }
  }

  /**
   * Replace `deleteCount` events from `start` with `events`, keeping ties and
   * tuplet groups attached to the events they were made for.
   *
   * Both are held by index, so a bare splice would silently reattach them to
   * whatever slid into place. Anything wholly before the range is left alone and
   * anything wholly after is shifted; anything the range touches is dropped,
   * because a tie asserts two neighbours are one sound and a bracket covers
   * consecutive events, and neither survives an end being replaced or a gap
   * opening inside it. To change an event and keep both, use `setDuration`,
   * which replaces in place rather than restructuring.
   */
  replaceEvents(
    start: number,
    deleteCount: number,
    events: readonly NoteEvent[],
  ): void {
    if (!Number.isInteger(start) || start < 0 || start > this.eventCount) {
      throw new RangeError(
        `Cannot replace events at index ${start}: the melody has ${this.eventCount} events`,
      );
    }
    if (
      !Number.isInteger(deleteCount) ||
      deleteCount < 0 ||
      start + deleteCount > this.eventCount
    ) {
      throw new RangeError(
        `Cannot replace ${deleteCount} events at index ${start}: the melody has ${this.eventCount} events`,
      );
    }
    if (deleteCount === 0 && events.length === 0) {
      return;
    }

    const end = start + deleteCount;
    const delta = events.length - deleteCount;

    const ties = new Set<number>();
    for (const i of this.tiedToNext) {
      // A tie joins `i` to `i + 1`, so it needs both of them to survive and to
      // still be neighbours afterwards.
      if (i + 1 < start) {
        ties.add(i);
      } else if (i >= end) {
        ties.add(i + delta);
      }
    }
    this.tiedToNext = ties;

    const tuplets = new Map<number, { count: number; tuplet: Tuplet }>();
    for (const [groupStart, group] of this.tuplets) {
      if (groupStart + group.count <= start) {
        tuplets.set(groupStart, group);
      } else if (groupStart >= end) {
        tuplets.set(groupStart + delta, group);
      }
    }
    this.tuplets = tuplets;

    this.events.splice(start, deleteCount, ...events);
  }

  tie(index: number): void {
    if (index < 0 || index >= this.eventCount - 1) {
      throw new RangeError(
        `Cannot tie at index ${index}: index + 1 must be a valid event index`,
      );
    }

    const current = this.getEvent(index);
    const next = this.getEvent(index + 1);

    const problem = this.tieProblem(index);
    if (problem) {
      throw new TypeError(problem);
    }

    this.tiedToNext.add(index);
  }

  /** Why `tie(index)` would be refused, or `undefined` if it would be allowed. */
  private tieProblem(index: number): string | undefined {
    const current = this.getEvent(index);
    const next = this.getEvent(index + 1);

    if (current instanceof Rest) {
      return "Cannot tie a rest to another event";
    }
    if (next instanceof Rest) {
      return "Cannot tie a note to a rest";
    }
    // Two notes still awaiting a pitch will be pitched together, so they can be
    // tied now. One of each cannot: the tie would claim they are one sound
    // while only one of them has decided what that sound is.
    if (current instanceof Note !== next instanceof Note) {
      return "Cannot tie a note to one that has no pitch yet";
    }
    if (
      current instanceof Note &&
      next instanceof Note &&
      !current.pitch.isEqual(next.pitch)
    ) {
      return "Cannot tie notes with different pitches: pitches must match exactly";
    }
    return undefined;
  }

  /**
   * Whether `tie(index)` would succeed, so a tie control can be offered or
   * greyed without having to attempt it and catch the refusal.
   */
  canTie(index: number): boolean {
    if (index < 0 || index >= this.eventCount - 1) {
      return false;
    }
    return this.tieProblem(index) === undefined;
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
    if (event instanceof Note) {
      this.events[index] = new Note(event.pitch, duration);
    } else if (event instanceof UnpitchedNote) {
      this.events[index] = new UnpitchedNote(duration);
    } else {
      this.events[index] = new Rest(duration);
    }
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
