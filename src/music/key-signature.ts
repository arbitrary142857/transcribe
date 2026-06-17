import { Pitch } from "./pitch.js";
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
}
