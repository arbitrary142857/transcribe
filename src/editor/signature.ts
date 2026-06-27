import type { KeySignature } from "../music/key-signature.js";
import { Melody } from "../music/melody.js";
import { Note, Rest } from "../music/note-event.js";
import { spellForMelodyEvent } from "../music/spelling.js";

/**
 * Whether anything but silence has been written.
 *
 * The meter and the clef are settled before writing starts and fixed after:
 * a different meter would leave events no longer fitting their bars, and the
 * clef is chosen for the range the music will sit in, which only means anything
 * while that music is still the music being written.
 */
export function hasMusic(melody: Melody): boolean {
  for (let i = 0; i < melody.eventCount; i++) {
    if (!(melody.getEvent(i) instanceof Rest)) {
      return true;
    }
  }
  return false;
}

/**
 * The same melody in a different key, respelled to suit it.
 *
 * A key signature cannot be changed in place, so this builds a new melody and
 * carries the events, ties and brackets over. Every note keeps the sound it
 * had and only the spelling moves: a C-sharp becomes a D-flat where the new key
 * already flats D, which is what stops a key change from filling the page with
 * accidentals. Nothing is lost by doing it automatically, because pitches are
 * only ever entered through the same speller — no one has hand-picked an
 * enharmonic that this would overrule.
 */
export function withKeySignature(
  melody: Melody,
  keySignature: KeySignature,
): Melody {
  const events = Array.from({ length: melody.eventCount }, (_, i) =>
    melody.getEvent(i),
  );
  const moved = new Melody(keySignature, melody.timeSignature, events);

  for (let i = 0; i < melody.eventCount - 1; i++) {
    if (melody.isTiedToNext(i)) {
      moved.tie(i);
    }
  }
  for (const { start, count } of melody.tupletSpans()) {
    moved.groupTuplet(start, count);
  }

  // Left to right, because what a note is spelled as depends on the accidentals
  // already sounding earlier in its bar.
  for (let i = 0; i < moved.eventCount; i++) {
    const event = moved.getEvent(i);
    if (event instanceof Note) {
      moved.setPitch(i, spellForMelodyEvent(moved, i, event.pitch.toMidi()));
    }
  }

  return moved;
}
