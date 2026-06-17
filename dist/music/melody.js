import { Note, Rest } from "./note-event.js";
import { SAMPLE_RATE, writeTone } from "./synthesis.js";
import { encodeWav } from "./wav.js";
export class Melody {
    keySignature;
    timeSignature;
    events;
    constructor(keySignature, timeSignature, events) {
        this.keySignature = keySignature;
        this.timeSignature = timeSignature;
        this.events = [...events];
    }
    get eventCount() {
        return this.events.length;
    }
    getEvent(index) {
        const event = this.events[index];
        if (!event) {
            throw new RangeError(`No event at index ${index}`);
        }
        return event;
    }
    setPitch(index, pitch) {
        const event = this.getEvent(index);
        if (!(event instanceof Note)) {
            throw new TypeError("Cannot set pitch on a rest");
        }
        this.events[index] = new Note(pitch, event.duration);
    }
    setDuration(index, duration) {
        const event = this.getEvent(index);
        this.events[index] =
            event instanceof Note
                ? new Note(event.pitch, duration)
                : new Rest(duration);
    }
    isEqual(other) {
        if (!this.keySignature.isEqual(other.keySignature)) {
            return false;
        }
        if (this.timeSignature.beats !== other.timeSignature.beats ||
            this.timeSignature.beatUnit !== other.timeSignature.beatUnit) {
            return false;
        }
        if (this.eventCount !== other.eventCount) {
            return false;
        }
        for (let i = 0; i < this.eventCount; i++) {
            if (!this.getEvent(i).isEqual(other.getEvent(i))) {
                return false;
            }
        }
        return true;
    }
    isEnharmonicallyEqual(other) {
        if (!this.keySignature.isEnharmonicallyEqual(other.keySignature)) {
            return false;
        }
        if (this.timeSignature.beats !== other.timeSignature.beats ||
            this.timeSignature.beatUnit !== other.timeSignature.beatUnit) {
            return false;
        }
        if (this.eventCount !== other.eventCount) {
            return false;
        }
        for (let i = 0; i < this.eventCount; i++) {
            if (!this.getEvent(i).isEnharmonicallyEqual(other.getEvent(i))) {
                return false;
            }
        }
        return true;
    }
    /** WAV file bytes (44.1 kHz, mono, 16-bit PCM) at the given quarter-note bpm. */
    playback(bpm) {
        if (bpm <= 0) {
            throw new RangeError("bpm must be positive");
        }
        let totalSeconds = 0;
        for (let i = 0; i < this.eventCount; i++) {
            totalSeconds += this.getEvent(i).duration.inSeconds(bpm);
        }
        const samples = new Float32Array(Math.ceil(totalSeconds * SAMPLE_RATE));
        let offsetSeconds = 0;
        for (let i = 0; i < this.eventCount; i++) {
            const event = this.getEvent(i);
            const durationSeconds = event.duration.inSeconds(bpm);
            if (event instanceof Note) {
                writeTone(samples, Math.round(offsetSeconds * SAMPLE_RATE), event.pitch.toFrequency(), durationSeconds);
            }
            offsetSeconds += durationSeconds;
        }
        return encodeWav(samples, SAMPLE_RATE);
    }
}
