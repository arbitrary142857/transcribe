import {
  Duration,
  KeySignature,
  Melody,
  Note,
  NoteValue,
  Pitch,
  Tuplet,
} from "../music/index.js";

const AB_MAJOR = new KeySignature(new Pitch("A", -1, 4), "major");

const WHOLE = () => new Duration(NoteValue.Whole);
const HALF = () => new Duration(NoteValue.Half);
const QUARTER = () => new Duration(NoteValue.Quarter);
const DOTTED_QUARTER = () => new Duration(NoteValue.Quarter, 1);
const EIGHTH = () => new Duration(NoteValue.Eighth);
const DOTTED_EIGHTH = () => new Duration(NoteValue.Eighth, 1);
const SIXTEENTH = () => new Duration(NoteValue.Sixteenth);
const TRIPLET_EIGHTH = () =>
  new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);
const QUINTUPLET_SIXTEENTH = () =>
  new Duration(NoteValue.Sixteenth, 0, Tuplet.Quintuplet);

const note = (
  letter: "A" | "B" | "C" | "D" | "E" | "F" | "G",
  accidental: -1 | 0 | 1,
  octave: number,
  duration: Duration,
) => new Note(new Pitch(letter, accidental, octave), duration);

/**
 * The eight-bar phrase the editor opens with: A-flat major, 4/4, treble.
 *
 * Written to exercise every notation feature the renderer handles at least
 * once — a tie inside a bar and two across barlines (one of which also crosses
 * the line break), dotted notes, an eighth-note triplet and a sixteenth-note
 * quintuplet, and accidentals both cancelling the key's flats (A natural, D
 * natural) and adding one (G flat).
 */
export function abMajorPhrase(): Melody {
  const melody = new Melody(AB_MAJOR, { beats: 4, beatUnit: 4 }, [
    // Bar 1
    note("A", -1, 4, QUARTER()),
    note("C", 0, 5, QUARTER()),
    note("E", -1, 5, DOTTED_QUARTER()),
    note("D", -1, 5, EIGHTH()),

    // Bar 2
    note("C", 0, 5, QUARTER()),
    note("C", 0, 5, QUARTER()),
    note("B", -1, 4, EIGHTH()),
    note("A", -1, 4, EIGHTH()),
    note("G", 0, 4, QUARTER()),

    // Bar 3
    note("F", 0, 4, DOTTED_EIGHTH()),
    note("G", 0, 4, SIXTEENTH()),
    note("A", -1, 4, TRIPLET_EIGHTH()),
    note("B", -1, 4, TRIPLET_EIGHTH()),
    note("C", 0, 5, TRIPLET_EIGHTH()),
    note("D", -1, 5, HALF()),

    // Bar 4
    note("A", 0, 4, QUARTER()),
    note("B", -1, 4, QUARTER()),
    note("C", 0, 5, HALF()),

    // Bar 5
    note("C", 0, 5, HALF()),
    note("D", -1, 5, QUARTER()),
    note("D", 0, 5, QUARTER()),

    // Bar 6
    note("E", -1, 5, QUARTER()),
    note("E", -1, 5, QUINTUPLET_SIXTEENTH()),
    note("F", 0, 5, QUINTUPLET_SIXTEENTH()),
    note("G", -1, 5, QUINTUPLET_SIXTEENTH()),
    note("F", 0, 5, QUINTUPLET_SIXTEENTH()),
    note("E", -1, 5, QUINTUPLET_SIXTEENTH()),
    note("D", -1, 5, HALF()),

    // Bar 7
    note("C", 0, 5, DOTTED_QUARTER()),
    note("B", -1, 4, EIGHTH()),
    note("A", -1, 4, HALF()),

    // Bar 8
    note("A", -1, 4, WHOLE()),
  ]);

  melody.tie(4); // within bar 2
  melody.tie(17); // bar 4 into bar 5, which is also the line break
  melody.tie(30); // bar 7 into bar 8

  melody.groupTuplet(11, 3); // eighth triplet in bar 3
  melody.groupTuplet(22, 5); // sixteenth quintuplet in bar 6

  return melody;
}
