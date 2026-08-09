/**
 * A key written the way it is spoken: `D♭ major`, `A minor`.
 *
 * One module because three pages want the same words. The bar above the score,
 * the fifteen buttons of the key chooser, and every level card each grew their
 * own copy of this with their own table of signs — and the play page's readout
 * would have been a fourth. They agreed, which is precisely why the drift
 * would have gone unnoticed.
 *
 * Signs rather than letters throughout: these are read and never typed into.
 */

import { keyForFifths, type KeySignature } from "../music/key-signature.js";
import type { Accidental, Mode } from "../music/types.js";

const ACCIDENTAL_SIGN: Record<Accidental, string> = {
  [-2]: "\u{1D12B}",
  [-1]: "♭",
  0: "",
  1: "♯",
  2: "\u{1D12A}",
};

export const keyLabel = (key: KeySignature): string =>
  `${key.tonic.letter}${ACCIDENTAL_SIGN[key.tonic.accidental]} ${key.mode}`;

/**
 * The same, from the two columns a level card is drawn from.
 *
 * A card never holds a `KeySignature` — it holds the fifths and the mode the
 * listing query read, which is the whole point of those being columns.
 */
export const keyLabelOfFifths = (fifths: number, mode: Mode): string =>
  keyLabel(keyForFifths(fifths, mode));
