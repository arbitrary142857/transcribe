import { ACCIDENTAL_STRING, Pitch } from "./pitch.js";
import type { Accidental, LetterName, Mode } from "./types.js";

/**
 * Where each natural letter sits on the circle of fifths, F–B. The order
 * F C G D A E B is also the order sharps are added to a key signature (and its
 * reverse the order flats are), which is what makes the arithmetic below work.
 */
const LETTER_FIFTHS: Record<LetterName, number> = {
  F: -1,
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
};

/** A minor key sits three fifths flatward of the major key of the same tonic. */
const MINOR_OFFSET = 3;

export class KeySignature {
  constructor(
    public tonic: Pitch,
    public mode: Mode,
  ) {}

  /**
   * Position on the circle of fifths: positive counts sharps, negative flats.
   * C major is 0, G major 1, F major -1, A♭ major -4. Raising the tonic by a
   * semitone moves seven fifths, so C♯ major is 7.
   */
  fifths(): number {
    return (
      LETTER_FIFTHS[this.tonic.letter] +
      7 * this.tonic.accidental -
      (this.mode === "minor" ? MINOR_OFFSET : 0)
    );
  }

  /**
   * The alteration this key signature applies to `letter`, in every octave —
   * A♭ major flattens B, E, A and D and leaves G, C and F natural.
   *
   * A letter is sharpened once its own position on the circle of fifths falls
   * more than six behind the key's, and again seven fifths later.
   *
   * Throws `RangeError` for keys needing more than a double accidental, which
   * only absurd tonics such as B♯♯ major reach.
   */
  alterationFor(letter: LetterName): Accidental {
    const alteration = Math.floor((this.fifths() - LETTER_FIFTHS[letter] + 5) / 7);
    if (alteration < -2 || alteration > 2) {
      throw new RangeError(
        `Key ${this} alters ${letter} by ${alteration} semitones, beyond a double accidental`,
      );
    }
    return alteration as Accidental;
  }

  isEqual(other: KeySignature): boolean {
    return this.mode === other.mode && this.tonic.isEqual(other.tonic);
  }

  isEnharmonicallyEqual(other: KeySignature): boolean {
    return (
      this.mode === other.mode && this.tonic.toChroma() === other.tonic.toChroma()
    );
  }

  /** VexFlow key-signature spec, e.g. `"G"`, `"F#m"`, `"Db"`. */
  toString(): string {
    const name = `${this.tonic.letter}${ACCIDENTAL_STRING[this.tonic.accidental]}`;
    return this.mode === "minor" ? `${name}m` : name;
  }
}

/** Letters in circle-of-fifths order, so index 0 is `LETTER_FIFTHS` of -1. */
const FIFTHS_LETTERS: readonly LetterName[] = ["F", "C", "G", "D", "A", "E", "B"];

/**
 * The key at a position on the circle of fifths — the inverse of `fifths()`.
 *
 * One signature names two keys, a major and its relative minor, and both print
 * exactly the same accidentals; `keyForFifths(0, …)` is C major or A minor.
 * That is what lets a key be chosen by pointing at a signature and then saying
 * which of the two it is.
 */
export function keyForFifths(fifths: number, mode: Mode): KeySignature {
  // Undo the minor's three-fifths offset, then split what is left into a letter
  // and however many times the seven letters have been gone round.
  const position = fifths + (mode === "minor" ? MINOR_OFFSET : 0);
  const accidental = Math.floor((position + 1) / 7);
  const letter = FIFTHS_LETTERS[position - 7 * accidental + 1];
  if (!letter || accidental < -2 || accidental > 2) {
    throw new RangeError(`No ${mode} key sits ${fifths} fifths from C`);
  }
  return new KeySignature(new Pitch(letter, accidental as Accidental, 4), mode);
}
