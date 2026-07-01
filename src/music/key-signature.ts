import { ACCIDENTAL_STRING, Pitch } from "./pitch.js";
import type { Mode } from "./types.js";

export class KeySignature {
  constructor(
    public tonic: Pitch,
    public mode: Mode,
  ) {}

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
