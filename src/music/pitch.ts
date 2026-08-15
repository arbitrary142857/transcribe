import type { Accidental, LetterName } from "./types.js";

/** Semitone of each natural letter above C, within one octave. */
export const LETTER_SEMITONE: Record<LetterName, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** EasyScore / key-signature accidental spelling (VexFlow). */
export const ACCIDENTAL_STRING: Record<Accidental, string> = {
  [-2]: "bb",
  [-1]: "b",
  0: "",
  1: "#",
  2: "##",
};

/**
 * Frequency in Hz of a MIDI note number; A4 = 69 = 440 Hz by default.
 *
 * Outside the class because the piano is handed a key to sound rather than a
 * pitch to write: which of D♯ and E♭ was meant is a question about notation,
 * and the string does not care.
 */
export const frequencyOfMidi = (midi: number, a4Hz = 440): number =>
  a4Hz * 2 ** ((midi - 69) / 12);

export class Pitch {
  constructor(
    public letter: LetterName,
    public accidental: Accidental,
    public octave: number,
  ) {
    if (!Number.isInteger(this.octave)) {
      throw new TypeError("octave must be an integer");
    }
  }

  /** Absolute semitone index (C0 = 0). */
  toSemitone(): number {
    return this.octave * 12 + LETTER_SEMITONE[this.letter] + this.accidental;
  }

  /** MIDI note number (C4 = 60). */
  toMidi(): number {
    return this.toSemitone() + 12;
  }

  /** Frequency in Hz; A4 = 440 Hz by default. */
  toFrequency(a4Hz = 440): number {
    return frequencyOfMidi(this.toMidi(), a4Hz);
  }

  /** Pitch-class chroma: semitone within the octave, 0–11. */
  toChroma(): number {
    return ((this.toSemitone() % 12) + 12) % 12;
  }

  isEqual(other: Pitch): boolean {
    return (
      this.letter === other.letter &&
      this.accidental === other.accidental &&
      this.octave === other.octave
    );
  }

  isEnharmonicallyEqual(other: Pitch): boolean {
    return this.toSemitone() === other.toSemitone();
  }

  /** EasyScore pitch token, e.g. `"f#4"`, `"gb3"`. */
  toString(): string {
    return `${this.letter.toLowerCase()}${ACCIDENTAL_STRING[this.accidental]}${this.octave}`;
  }
}
