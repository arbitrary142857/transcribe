import { Note, type NoteEvent, Rest } from "../music/note-event.js";
import { ACCIDENTAL_STRING, type Pitch } from "../music/pitch.js";
import type { Accidental, LetterName } from "../music/types.js";

/**
 * The middle line of each clef, where an event with no pitch of its own sits.
 *
 * Rests take a staff position only so VexFlow can place the glyph, and a note
 * awaiting a pitch takes the same one — both are undecided, and the middle line
 * is where unpitched notation conventionally goes. `vexFlowKeyFor` falls back to
 * treble for any clef not listed.
 *
 * Kept as a letter and an octave rather than as a finished string, because an
 * unpitched note has to be able to spell that letter with an accidental on it —
 * see `vexFlowKeyFor`.
 */
const MIDDLE_LINE_BY_CLEF: Record<string, { letter: LetterName; octave: number }> =
  {
    treble: { letter: "B", octave: 4 },
    bass: { letter: "D", octave: 3 },
  };

function pitchToVexKey(pitch: Pitch): string {
  return `${pitch.letter.toLowerCase()}${ACCIDENTAL_STRING[pitch.accidental]}/${pitch.octave}`;
}

export function middleLineOf(clef: string): string {
  const { letter, octave } = middleLinePitchOf(clef);
  return `${letter.toLowerCase()}/${octave}`;
}

/** The middle line as the letter and octave it stands on. */
export function middleLinePitchOf(clef: string): {
  letter: LetterName;
  octave: number;
} {
  return MIDDLE_LINE_BY_CLEF[clef] ?? MIDDLE_LINE_BY_CLEF.treble!;
}

/**
 * The VexFlow key string for an event in this clef.
 *
 * A note awaiting a pitch takes an `x` glyph suffix, which VexFlow reads as a
 * notehead name and resolves to the whole, half or black X from the duration —
 * so the one suffix is right at every length.
 *
 * `alteration` is what the key signature and the bar so far already do to the
 * middle line's letter, and it exists because VexFlow decides what to print by
 * comparing a note's spelling against that same running state. A bare letter is
 * a claim that the note is natural: in a key that flattens the middle line it
 * draws a ♮ in front of the X, and then records the letter as natural for the
 * rest of the bar, so the next real B♭ prints a flat it does not need. An X has
 * no pitch and so must claim nothing — which it does by agreeing with whatever
 * is already in force. Rests are skipped by VexFlow's accidental pass outright
 * and need no such help.
 */
export function vexFlowKeyFor(
  event: NoteEvent,
  clef: string,
  alteration: Accidental = 0,
): string {
  if (event instanceof Note) {
    return pitchToVexKey(event.pitch);
  }
  if (event instanceof Rest) {
    return middleLineOf(clef);
  }
  const { letter, octave } = middleLinePitchOf(clef);
  return `${letter.toLowerCase()}${ACCIDENTAL_STRING[alteration]}/${octave}/x`;
}
