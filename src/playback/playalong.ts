/**
 * The melody, read as something to play rather than something to draw.
 *
 * A score and a performance are not the same list. The stave draws every event
 * — rests included, tied notes as several noteheads, a placeholder as an X —
 * while the ear wants only what makes a sound, once each, for as long as it
 * actually lasts. This is that reading, and nothing else: no audio, no tempo,
 * no browser, so it can be tested as the arithmetic it is.
 *
 * Positions come out in whole notes from the head of the melody, the same unit
 * `eventPositions` works in, because seconds are the tempo map's business and
 * the map moves whenever the marks do.
 */

import { eventPositions } from "../editor/position.js";
import type { Melody } from "../music/melody.js";
import { Note } from "../music/note-event.js";

/**
 * What is heard while the section plays.
 *
 * `both` exists on purpose rather than as the gap between two switches: playing
 * your own transcription over the recording is how you find out whether it is
 * right, and it is the thing this is most useful for.
 */
export type Hearing = "video" | "both" | "notes";

/** One sound: what to play, when to start it, and when to let it go. */
export type SoundingNote = {
  /** Whole notes from the head of the melody. */
  readonly start: number;
  /** Where the sound ends — the end of the whole tied run, if it is tied. */
  readonly end: number;
  readonly midi: number;
};

/**
 * Every note that makes a sound, in order.
 *
 * Three things are left out, and each for its own reason. **Rests** are the
 * silence between the notes. **Notes still awaiting a pitch** are silent
 * because sounding one would mean choosing its pitch, which is the very thing
 * the person listening is trying to do. And the **continuations of a tied run**
 * are not separate sounds — a tie is one note written across a barline or a
 * beat, so the run is played once and held for the length of all of it.
 *
 * Tuplets need no handling at all: `asWholeNoteFraction` has already divided
 * the bracket's ratio out, so a triplet eighth reports a twelfth of a whole
 * note and is simply short.
 */
export function soundingNotes(melody: Melody): SoundingNote[] {
  const positions = eventPositions(melody);
  const notes: SoundingNote[] = [];

  for (let index = 0; index < melody.eventCount; index++) {
    // A continuation is part of the sound before it, not a sound of its own.
    if (melody.isTiedToPrev(index)) continue;
    const event = melody.getEvent(index);
    // One test covers rests and unpitched notes both: `UnpitchedNote` is its
    // own class rather than a kind of `Note`, so neither is one.
    if (!(event instanceof Note)) continue;

    let last = index;
    while (melody.isTiedToNext(last)) last++;
    const from = positions[index]!;
    const to = positions[last]!;

    notes.push({
      start: from.start.toNumber(),
      end: to.start.add(to.length).toNumber(),
      midi: event.pitch.toMidi(),
    });
  }

  return notes;
}

/**
 * The notes beginning in `[from, to)`.
 *
 * Half-open, exactly as `beatsBetween` is, and for the same reason: the
 * scheduler asks for one window after another and keeps no record of what it
 * has already played, so a note falling on the seam must belong to one window
 * and not to both.
 *
 * A note that began before the window is not in it, however long it lasts.
 * What is being scheduled is the moment it is struck, and that moment has gone.
 */
export function notesBetween<T extends { readonly start: number }>(
  notes: readonly T[],
  from: number,
  to: number,
): T[] {
  if (!(to > from)) return [];
  return notes.filter((note) => note.start >= from && note.start < to);
}

/**
 * The note already under way at `seconds`, if one is.
 *
 * The other half of the scheduler's reading. `notesBetween` lines up what is
 * coming; this is for the moments the line is picked up again in the middle —
 * a seek, a loop wrap, the piano being switched on mid-phrase — where the note
 * that is sounding began before anything was listening, and can still be joined
 * part-way through.
 *
 * **Strictly** begun, and that is the whole of what keeps a note from being
 * struck twice: a note starting exactly at `seconds` is the window's, since
 * `notesBetween` is half-open at its own start and the two are always asked
 * about the same moment or later.
 */
export function heldAt<
  T extends { readonly start: number; readonly end: number },
>(notes: readonly T[], seconds: number): T | undefined {
  return notes.find((note) => note.start < seconds && seconds < note.end);
}
