import { Note, type NoteEvent, Rest } from "../music/note-event.js";
import { ACCIDENTAL_STRING, type Pitch } from "../music/pitch.js";

/**
 * The middle line of each clef, where an event with no pitch of its own sits.
 *
 * Rests take a staff position only so VexFlow can place the glyph, and a note
 * awaiting a pitch takes the same one — both are undecided, and the middle line
 * is where unpitched notation conventionally goes. `vexFlowKeyFor` falls back to
 * treble for any clef not listed.
 */
const MIDDLE_LINE_BY_CLEF: Record<string, string> = {
  treble: "b/4",
  bass: "d/3",
};

function pitchToVexKey(pitch: Pitch): string {
  return `${pitch.letter.toLowerCase()}${ACCIDENTAL_STRING[pitch.accidental]}/${pitch.octave}`;
}

export function middleLineOf(clef: string): string {
  return MIDDLE_LINE_BY_CLEF[clef] ?? MIDDLE_LINE_BY_CLEF.treble!;
}

/**
 * The VexFlow key string for an event in this clef.
 *
 * A note awaiting a pitch takes an `x` glyph suffix, which VexFlow reads as a
 * notehead name and resolves to the whole, half or black X from the duration —
 * so the one suffix is right at every length.
 */
export function vexFlowKeyFor(event: NoteEvent, clef: string): string {
  if (event instanceof Note) {
    return pitchToVexKey(event.pitch);
  }
  const middle = middleLineOf(clef);
  return event instanceof Rest ? middle : `${middle}/x`;
}
