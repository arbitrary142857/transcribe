import {
  Duration,
  KeySignature,
  Melody,
  Note,
  NoteValue,
  Pitch,
  Rest,
  Tuplet,
} from "../music/index.js";

/**
 * Two-bar C major scale: beamed eighths ascending, then quarters descending.
 * Exercises auto-stem direction (low vs high notes) and auto-beaming.
 */
export function cMajorScale(): Melody {
  return new Melody(
    new KeySignature(new Pitch("C", 0, 4), "major"),
    { beats: 4, beatUnit: 4 },
    [
      new Note(new Pitch("C", 0, 4), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("D", 0, 4), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("E", 0, 4), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("F", 0, 4), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("G", 0, 4), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("A", 0, 4), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("B", 0, 4), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("C", 0, 5), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("B", 0, 4), new Duration(NoteValue.Quarter)),
      new Note(new Pitch("A", 0, 4), new Duration(NoteValue.Quarter)),
      new Note(new Pitch("G", 0, 4), new Duration(NoteValue.Quarter)),
      new Note(new Pitch("C", 0, 4), new Duration(NoteValue.Quarter)),
    ],
  );
}

/**
 * G major phrase with a within-bar tie and a tie across the barline.
 * Bar 1: dotted quarter + eighth + two tied quarters.
 * Bar 2: half (tied from previous) + two quarters.
 */
export function tiedPhraseGMajor(): Melody {
  const melody = new Melody(
    new KeySignature(new Pitch("G", 0, 4), "major"),
    { beats: 4, beatUnit: 4 },
    [
      new Note(new Pitch("D", 0, 5), new Duration(NoteValue.Quarter, 1)),
      new Note(new Pitch("E", 0, 5), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("B", 0, 4), new Duration(NoteValue.Quarter)),
      new Note(new Pitch("B", 0, 4), new Duration(NoteValue.Quarter)),
      new Note(new Pitch("B", 0, 4), new Duration(NoteValue.Half)),
      new Note(new Pitch("A", 0, 4), new Duration(NoteValue.Quarter)),
      new Note(new Pitch("G", 0, 4), new Duration(NoteValue.Quarter)),
    ],
  );
  melody.tie(2); // within-bar B4–B4
  melody.tie(3); // B4 across barline into the half note
  return melody;
}

/**
 * A minor melody with rests, a chromatic accidental, and a dotted rhythm.
 */
export function restsAndAccidentals(): Melody {
  return new Melody(
    new KeySignature(new Pitch("A", 0, 4), "minor"),
    { beats: 4, beatUnit: 4 },
    [
      new Note(new Pitch("A", 0, 4), new Duration(NoteValue.Quarter)),
      new Rest(new Duration(NoteValue.Eighth)),
      new Note(new Pitch("C", 0, 5), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("B", 0, 4), new Duration(NoteValue.Quarter)),
      new Note(new Pitch("G", 1, 4), new Duration(NoteValue.Quarter)), // G♯
      new Note(new Pitch("A", 0, 4), new Duration(NoteValue.Quarter, 1)),
      new Note(new Pitch("B", 0, 4), new Duration(NoteValue.Eighth)),
      new Note(new Pitch("C", 0, 5), new Duration(NoteValue.Quarter)),
      new Rest(new Duration(NoteValue.Quarter)),
    ],
  );
}

/**
 * Two bars of eighths in D major with chromatic neighbors and a tie over the barline.
 * Bar 1: F♯ F♮ E E♭ D E♭ E♮ F♮
 * Bar 2: F♮ F♮ F♯ E E♭ C♯ F♮ F♯  (first F♮ tied from previous bar)
 */
export function chromaticDMajor(): Melody {
  const eighth = new Duration(NoteValue.Eighth);
  const melody = new Melody(
    new KeySignature(new Pitch("D", 0, 4), "major"),
    { beats: 4, beatUnit: 4 },
    [
      new Note(new Pitch("F", 1, 4), eighth), // F♯
      new Note(new Pitch("F", 0, 4), eighth), // F♮
      new Note(new Pitch("E", 0, 4), eighth),
      new Note(new Pitch("E", -1, 4), eighth), // E♭
      new Note(new Pitch("D", 0, 4), eighth),
      new Note(new Pitch("E", -1, 4), eighth), // E♭
      new Note(new Pitch("E", 0, 4), eighth), // E♮
      new Note(new Pitch("F", 0, 4), eighth), // F♮ → ties over barline
      new Note(new Pitch("F", 0, 4), eighth), // F♮
      new Note(new Pitch("F", 0, 4), eighth), // F♮
      new Note(new Pitch("F", 1, 4), eighth), // F♯
      new Note(new Pitch("E", 0, 4), eighth),
      new Note(new Pitch("E", -1, 4), eighth), // E♭
      new Note(new Pitch("C", 1, 4), eighth), // C♯
      new Note(new Pitch("F", 0, 4), eighth), // F♮
      new Note(new Pitch("F", 1, 4), eighth), // F♯
    ],
  );
  melody.tie(7); // F♮ across the barline
  return melody;
}

/**
 * Three bars of 6/8 in D major (bass clef register): chromatic neighbors
 * extended through G and resolved to the tonic.
 * Bar 1: F♯ F♮ E E♭ D E♭
 * Bar 2: E♮ F♮ F♯ G♮ G♭ F♮  (last F♮ tied over the barline)
 * Bar 3: F♮ E E♭ D C♯ D
 */
export function chromaticDMajor68(): Melody {
  const eighth = new Duration(NoteValue.Eighth);
  const melody = new Melody(
    new KeySignature(new Pitch("D", 0, 3), "major"),
    { beats: 6, beatUnit: 8 },
    [
      new Note(new Pitch("F", 1, 3), eighth), // F♯
      new Note(new Pitch("F", 0, 3), eighth), // F♮
      new Note(new Pitch("E", 0, 3), eighth),
      new Note(new Pitch("E", -1, 3), eighth), // E♭
      new Note(new Pitch("D", 0, 3), eighth),
      new Note(new Pitch("E", -1, 3), eighth), // E♭
      new Note(new Pitch("E", 0, 3), eighth), // E♮
      new Note(new Pitch("F", 0, 3), eighth), // F♮
      new Note(new Pitch("F", 1, 3), eighth), // F♯
      new Note(new Pitch("G", 0, 3), eighth), // G♮
      new Note(new Pitch("G", -1, 3), eighth), // G♭
      new Note(new Pitch("F", 0, 3), eighth), // F♮ → ties over barline
      new Note(new Pitch("F", 0, 3), eighth), // F♮
      new Note(new Pitch("E", 0, 3), eighth),
      new Note(new Pitch("E", -1, 3), eighth), // E♭
      new Note(new Pitch("D", 0, 3), eighth),
      new Note(new Pitch("C", 1, 3), eighth), // C♯
      new Note(new Pitch("D", 0, 3), eighth),
    ],
  );
  melody.tie(11); // F♮ across bars 2→3
  return melody;
}

/**
 * Two bars of 4/4 in C major exercising both tuplet ratios.
 * Bar 1: eighth triplet (3:2) + quarter triplet (3:2) + quarter.
 * Bar 2: sixteenth quintuplet (5:4) + three quarters.
 */
export function tupletsCMajor(): Melody {
  const eighthTriplet = new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);
  const quarterTriplet = new Duration(NoteValue.Quarter, 0, Tuplet.Triplet);
  const sixteenthQuintuplet = new Duration(
    NoteValue.Sixteenth,
    0,
    Tuplet.Quintuplet,
  );
  const quarter = new Duration(NoteValue.Quarter);

  const melody = new Melody(
    new KeySignature(new Pitch("C", 0, 4), "major"),
    { beats: 4, beatUnit: 4 },
    [
      new Note(new Pitch("C", 0, 5), eighthTriplet),
      new Note(new Pitch("D", 0, 5), eighthTriplet),
      new Note(new Pitch("E", 0, 5), eighthTriplet),
      new Note(new Pitch("F", 0, 5), quarterTriplet),
      new Note(new Pitch("E", 0, 5), quarterTriplet),
      new Note(new Pitch("D", 0, 5), quarterTriplet),
      new Note(new Pitch("C", 0, 5), quarter),
      new Note(new Pitch("G", 0, 4), sixteenthQuintuplet),
      new Note(new Pitch("A", 0, 4), sixteenthQuintuplet),
      new Note(new Pitch("B", 0, 4), sixteenthQuintuplet),
      new Note(new Pitch("C", 0, 5), sixteenthQuintuplet),
      new Note(new Pitch("D", 0, 5), sixteenthQuintuplet),
      new Note(new Pitch("E", 0, 5), quarter),
      new Note(new Pitch("D", 0, 5), quarter),
      new Note(new Pitch("C", 0, 5), quarter),
    ],
  );
  melody.groupTuplet(0, 3); // eighth triplet
  melody.groupTuplet(3, 3); // quarter triplet
  melody.groupTuplet(7, 5); // sixteenth quintuplet
  return melody;
}

export type SampleMelodySpec = {
  create: () => Melody;
  /** VexFlow clef; defaults to treble when omitted. */
  clef?: string;
};

export const sampleMelodies = {
  scale: { create: cMajorScale },
  tied: { create: tiedPhraseGMajor },
  rests: { create: restsAndAccidentals },
  chromatic: { create: chromaticDMajor },
  chromatic68: { create: chromaticDMajor68, clef: "bass" },
  tuplets: { create: tupletsCMajor },
} as const satisfies Record<string, SampleMelodySpec>;

export type SampleMelodyId = keyof typeof sampleMelodies;
