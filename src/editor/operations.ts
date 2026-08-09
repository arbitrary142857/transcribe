import { Duration, writeLength, writtenValue } from "../music/duration.js";
import { Fraction, whole } from "../music/fraction.js";
import type { KeySignature } from "../music/key-signature.js";
import { Melody } from "../music/melody.js";
import { Note, type NoteEvent, Rest, UnpitchedNote } from "../music/note-event.js";
import { Tuplet, type TupletSpan } from "../music/tuplet.js";
import type { TimeSignature } from "../music/types.js";
import { normalize, restsBetween } from "./normalize.js";
import {
  barLengthOf,
  eventPositions,
  indexCovering,
} from "./position.js";

const ZERO = new Fraction(0, 1);

/** What a duration control writes: a note, or silence. */
export type WriteKind = "note" | "rest";

const minOf = (a: Fraction, b: Fraction) => (a.compare(b) <= 0 ? a : b);

/**
 * A melody of `bars` bars with nothing written yet.
 *
 * The count is for the life of the piece: editing fills these bars in and
 * writes over them, but never adds one or takes one away — the count was
 * chosen against the video's timing marks, and a length that changed
 * afterwards would leave those marks measuring something else.
 */
export function emptyMelody(
  keySignature: KeySignature,
  timeSignature: TimeSignature,
  bars = 1,
): Melody {
  const melody = new Melody(keySignature, timeSignature, []);
  melody.replaceEvents(
    0,
    0,
    restsBetween(
      melody,
      ZERO,
      barLengthOf(timeSignature).multiply(whole(bars)),
    ),
  );
  normalize(melody);
  return melody;
}

/**
 * The stretch an edit at `index` may rewrite: the event itself, plus the rests
 * following it inside the same bar.
 *
 * Rests are room; a note is not. So the stretch stops at the next note, and it
 * stops at the barline, because a duration may never overrun one.
 */
function writableSpanAt(
  melody: Melody,
  index: number,
): { endIndex: number; length: Fraction; limitedBy: RoomLimit } {
  const positions = eventPositions(melody);
  const position = positions[index];
  if (!position) {
    throw new RangeError(
      `No event at index ${index}: the melody has ${melody.eventCount} events`,
    );
  }

  // Inside a bracket the bracket is the world: its members share one ratio and
  // one total, so an edit may take room from its neighbours but never from the
  // bar around it.
  const bracket = melody.getTupletSpan(index);
  const bracketed = !bracket.tuplet.isNone();
  const lastIndex = bracketed
    ? bracket.start + bracket.count
    : melody.eventCount;

  let endIndex = index + 1;
  let toNextNote = position.length;
  while (endIndex < lastIndex) {
    const next = positions[endIndex]!;
    if (!(melody.getEvent(endIndex) instanceof Rest) || next.bar !== position.bar) {
      break;
    }
    toNextNote = toNextNote.add(next.length);
    endIndex += 1;
  }

  const boundary = bracketed
    ? positions
        .slice(bracket.start, bracket.start + bracket.count)
        .reduce((total, member) => total.add(member.length), ZERO)
        .add(positions[bracket.start]!.start)
    : // A bar that is somehow already overfull must not offer room it lacks.
      barLengthOf(melody.timeSignature).multiply(whole(position.bar + 1));

  const toBoundary = boundary.difference(position.start);
  const cramped = toNextNote.compare(toBoundary) < 0;

  return {
    endIndex,
    length: minOf(toNextNote, toBoundary),
    limitedBy: cramped ? "next-note" : bracketed ? "bracket" : "barline",
  };
}

/** Which boundary an event ran into first. */
export type RoomLimit = "next-note" | "barline" | "bracket";

export type Room = {
  /** The longest an event here may be made. */
  available: Fraction;
  /** What stops it being longer — the reason to show for a greyed control. */
  limitedBy: RoomLimit;
};

/**
 * How long an event at `index` may be made, and what stops it being longer.
 *
 * This is what greys out the duration controls. Offering only what fits is what
 * keeps a duration from ever overrunning a bar, so the melody cannot reach a
 * state that rendering would refuse — and naming the boundary is what keeps the
 * greying from reading as arbitrary.
 */
export function roomAt(melody: Melody, index: number): Room {
  const { length, limitedBy } = writableSpanAt(melody, index);
  return { available: length, limitedBy };
}

/** The longest an event at `index` may be made. */
export function availableSpaceAt(melody: Melody, index: number): Fraction {
  return roomAt(melody, index).available;
}

/** The event `kind` describes, keeping a pitch already chosen. */
function replacement(
  existing: NoteEvent,
  duration: Duration,
  kind: WriteKind,
): NoteEvent {
  if (kind === "rest") {
    return new Rest(duration);
  }
  return existing instanceof Note
    ? new Note(existing.pitch, duration)
    : new UnpitchedNote(duration);
}

const kindOf = (event: NoteEvent): WriteKind =>
  event instanceof Rest ? "rest" : "note";

/**
 * Write an event of `duration` at `index`, and return where it ended up.
 *
 * Length is preserved from the event's start onward, by taking rest space or
 * handing it back: growing swallows the rests that follow, shrinking leaves
 * rests behind. Nothing after the edit ever moves, and no barline ever does —
 * which is what makes every edit reversible by writing over it again.
 *
 * Throws `RangeError` for a duration longer than there is room for. The controls
 * grey those out, so a user never reaches it, but nothing else guarantees a
 * caller has checked.
 */
export function writeAt(
  melody: Melody,
  index: number,
  duration: Duration,
  kind: WriteKind,
): number {
  const span = writableSpanAt(melody, index);
  const position = eventPositions(melody)[index]!;
  const newLength = duration.asWholeNoteFraction();

  // Worth knowing about this and the throws below it: the editor shows what
  // they say, word for word, in a tooltip beside the pointer. They are read by
  // whoever is writing the music down, not by whoever is reading a stack — so
  // they name what was tried rather than which array index it landed on.
  if (newLength.compare(span.length) > 0) {
    throw new RangeError(
      "That length does not fit before the next note or the barline.",
    );
  }

  const existing = melody.getEvent(index);
  const written = replacement(existing, duration, kind);

  // Nothing structural changes, so this keeps whatever ties and brackets the
  // event was part of rather than tearing them down and rebuilding them.
  if (newLength.equals(position.length)) {
    melody.setEvent(index, written);
    normalize(melody);
    return indexCovering(melody, position.start) ?? 0;
  }

  const bracket = melody.getTupletSpan(index);
  const filled = position.start.add(newLength);
  const spanEnd = position.start.add(span.length);
  const wasTiedToPrev = index > 0 && melody.isTiedToPrev(index);

  // Rests filling the room left over. Inside a bracket they take the bracket's
  // ratio, since every member shares it; elsewhere they are written to show
  // where the beats of the bar fall.
  const leftover: NoteEvent[] = bracket.tuplet.isNone()
    ? restsBetween(melody, filled, spanEnd)
    : writeLength(
        spanEnd
          .difference(filled)
          .multiply(
            new Fraction(bracket.tuplet.numNotes, bracket.tuplet.inTimeOf),
          ),
      ).map(
        (rest) =>
          new Rest(new Duration(rest.value, rest.dots, bracket.tuplet)),
      );

  const removed = span.endIndex - index;
  melody.replaceEvents(index, removed, [written, ...leftover]);

  if (!bracket.tuplet.isNone()) {
    regroupBracket(melody, bracket, leftover.length + 1 - removed);
  }

  // The splice drops ties reaching into it, since it cannot know the events
  // replacing them. Here we do: only the length changed, so a tie to the note
  // before is still the truth it was — unless the event just became silence.
  if (wasTiedToPrev && melody.canTie(index - 1)) {
    melody.tie(index - 1);
  }

  normalize(melody);
  return indexCovering(melody, position.start) ?? 0;
}

/**
 * Put a bracket back over its members after one of them was resized.
 *
 * `replaceEvents` drops a group the splice touches, because it cannot know what
 * replaced it. Here the total length is unchanged and the ratio is untouched,
 * so the bracket is remade over the new member count — unless there is only one
 * member left, in which case there is no tuplet any more: a ratio over a single
 * note says nothing, so it is written plainly instead.
 */
function regroupBracket(
  melody: Melody,
  bracket: TupletSpan,
  delta: number,
): void {
  const count = bracket.count + delta;
  if (count >= 2) {
    melody.groupTuplet(bracket.start, count);
    return;
  }

  const event = melody.getEvent(bracket.start);
  const sounding = event.duration.asWholeNoteFraction();
  melody.replaceEvents(
    bracket.start,
    1,
    writeLength(sounding).map((duration) => replacement(event, duration, kindOf(event))),
  );
}

/**
 * Turn the event at `index` into silence of the same length.
 *
 * Backspace. Nothing shifts and no barline moves, so writing a duration back
 * over the rest restores what was there — which is what lets a mistake be taken
 * back without an undo stack. At the end of the melody the rest left behind is
 * trailing silence rather than music, so repeated use erases backwards.
 */
export function convertToRestAt(melody: Melody, index: number): number {
  return writeAt(melody, index, melody.getEvent(index).duration, "rest");
}

/** The ratios worth offering, in the order a menu should show them. */
const CANDIDATE_RATIOS: readonly Tuplet[] = [
  Tuplet.Triplet,
  Tuplet.Quintuplet,
  new Tuplet(6, 4),
  new Tuplet(7, 4),
  new Tuplet(2, 3),
];

/** The written value each member takes when `length` is divided by `tuplet`. */
function memberValue(length: Fraction, tuplet: Tuplet): Duration | undefined {
  return writtenValue(length.multiply(new Fraction(1, tuplet.inTimeOf)));
}

/**
 * The ratios that divide the event at `index` evenly.
 *
 * A ratio is only worth offering when each member it would produce has a name:
 * dividing a length `L` by `n:m` gives members written as `L / m`, and if no
 * single duration is that long there is nothing to write. That check is what
 * keeps the menu honest rather than letting a division fail after the fact.
 */
export function ratiosOfferedAt(melody: Melody, index: number): Tuplet[] {
  // Brackets do not nest: a `Duration` carries one ratio and an event belongs
  // to one group, so a member cannot be divided again.
  if (!melody.getTupletSpan(index).tuplet.isNone()) {
    return [];
  }

  const length = melody.getEvent(index).duration.asWholeNoteFraction();
  return CANDIDATE_RATIOS.filter((tuplet) => memberValue(length, tuplet));
}

/**
 * Divide the event at `index` into a bracket of `tuplet`, in place.
 *
 * The members are bracketed as they are made, so the incomplete group the ADT
 * refuses to represent never exists. Nothing around the event moves: the
 * bracket sounds exactly as long as what it replaced, which is also why it can
 * never cross a barline — it is carved out of an event already inside one.
 */
export function divideIntoTuplet(
  melody: Melody,
  index: number,
  tuplet: Tuplet,
): number {
  const event = melody.getEvent(index);
  if (!melody.getTupletSpan(index).tuplet.isNone()) {
    throw new RangeError(
      "That note is already inside a tuplet, and brackets do not nest.",
    );
  }

  const value = memberValue(event.duration.asWholeNoteFraction(), tuplet);
  if (!value) {
    throw new RangeError(
      "A tuplet that size has no written value at this length.",
    );
  }

  const member = new Duration(value.value, value.dots, tuplet);
  const members = Array.from({ length: tuplet.numNotes }, () =>
    replacement(event, member, kindOf(event)),
  );

  melody.replaceEvents(index, 1, members);
  melody.groupTuplet(index, members.length);
  normalize(melody);
  return index;
}

/**
 * Undo a division: the bracket containing `index` becomes one event again.
 *
 * The exact inverse of dividing, down to what the event was — a bracket made
 * out of a rest gives a rest back. That is what lets the ratio control be a
 * toggle rather than a separate, destructive command.
 */
export function undivideTuplet(melody: Melody, index: number): number {
  const bracket = melody.getTupletSpan(index);
  if (bracket.tuplet.isNone()) {
    throw new RangeError("That note is not inside a tuplet.");
  }

  const first = melody.getEvent(bracket.start);
  const positions = eventPositions(melody);
  const start = positions[bracket.start]!.start;
  const sounding = positions
    .slice(bracket.start, bracket.start + bracket.count)
    .reduce((total, member) => total.add(member.length), ZERO);

  melody.ungroupTuplet(bracket.start);
  melody.replaceEvents(
    bracket.start,
    bracket.count,
    writeLength(sounding).map((duration) =>
      replacement(first, duration, kindOf(first)),
    ),
  );

  normalize(melody);
  return indexCovering(melody, start) ?? 0;
}

/**
 * Tie the event at `index` to the one after it, making the second agree with
 * the first about what is sounding.
 *
 * A tie asserts the two are one sound, so bringing the second into line is what
 * the tie means rather than a side effect of it. This is how a note reaches
 * across a barline, since no single duration may.
 */
export function tieForward(melody: Melody, index: number): void {
  const current = melody.getEvent(index);
  const next = melody.getEvent(index + 1);

  if (current instanceof Rest || next instanceof Rest) {
    throw new TypeError("A rest cannot be tied to anything.");
  }
  if (current instanceof Note) {
    melody.setPitch(index + 1, current.pitch);
  } else {
    melody.clearPitch(index + 1);
  }

  melody.tie(index);
}

/**
 * The MIDI number a semitone nudge at `index` should count from.
 *
 * A note that already has a pitch counts from its own, which is what makes Up
 * and Down raise and lower it.
 *
 * A note still waiting for one counts from the nearest pitched note *before*
 * it, so the first press lands a semitone away from whatever was last written.
 * Melodies mostly move by step, so that is usually within a key or two of the
 * right answer — which matters most on the play page, where every note but the
 * first starts blank and the arrows would otherwise do nothing at all until
 * the piano had been used on each one.
 *
 * Backwards only, deliberately: looking forward as well would mean the same
 * key press did different things depending on music the player has not written
 * yet. `fallback` is where an opening note starts from, there being nothing
 * behind it — the caller passes the middle of the clef's range.
 *
 * Nothing for a rest, which has no pitch to move.
 */
export function pitchNudgeFrom(
  melody: Melody,
  index: number,
  fallback: number,
): number | undefined {
  const event = melody.getEvent(index);
  if (event instanceof Rest) return undefined;
  if (event instanceof Note) return event.pitch.toMidi();

  for (let before = index - 1; before >= 0; before--) {
    const candidate = melody.getEvent(before);
    if (candidate instanceof Note) return candidate.pitch.toMidi();
  }
  return fallback;
}
