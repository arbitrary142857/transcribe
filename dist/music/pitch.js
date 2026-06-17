const LETTER_SEMITONE = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
};
const ACCIDENTAL_SUFFIX = {
    [-2]: "bb",
    [-1]: "b",
    0: "",
    1: "#",
    2: "##",
};
export class Pitch {
    letter;
    accidental;
    octave;
    constructor(letter, accidental, octave) {
        this.letter = letter;
        this.accidental = accidental;
        this.octave = octave;
        if (!Number.isInteger(this.octave)) {
            throw new TypeError("octave must be an integer");
        }
    }
    /** Absolute semitone index (C0 = 0). */
    toSemitone() {
        return this.octave * 12 + LETTER_SEMITONE[this.letter] + this.accidental;
    }
    /** MIDI note number (C4 = 60). */
    toMidi() {
        return this.toSemitone() + 12;
    }
    /** Frequency in Hz; A4 = 440 Hz by default. */
    toFrequency(a4Hz = 440) {
        return a4Hz * 2 ** ((this.toMidi() - 69) / 12);
    }
    /** Pitch-class chroma: semitone within the octave, 0–11. */
    toChroma() {
        return ((this.toSemitone() % 12) + 12) % 12;
    }
    isEqual(other) {
        return (this.letter === other.letter &&
            this.accidental === other.accidental &&
            this.octave === other.octave);
    }
    isEnharmonicallyEqual(other) {
        return this.toSemitone() === other.toSemitone();
    }
    toString() {
        return `${this.letter}${ACCIDENTAL_SUFFIX[this.accidental]}${this.octave}`;
    }
}
