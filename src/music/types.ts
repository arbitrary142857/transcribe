/** Natural letter names in scientific pitch notation. */
export type LetterName = "C" | "D" | "E" | "F" | "G" | "A" | "B";

/** Semitone offset from the natural: -2 = double-flat … +2 = double-sharp. */
export type Accidental = -2 | -1 | 0 | 1 | 2;

export type Mode = "major" | "minor";

export interface TimeSignature {
  readonly beats: number;
  readonly beatUnit: number;
}
