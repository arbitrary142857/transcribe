export class KeySignature {
    tonic;
    mode;
    constructor(tonic, mode) {
        this.tonic = tonic;
        this.mode = mode;
    }
    isEqual(other) {
        return this.mode === other.mode && this.tonic.isEqual(other.tonic);
    }
    isEnharmonicallyEqual(other) {
        return (this.mode === other.mode && this.tonic.toChroma() === other.tonic.toChroma());
    }
}
