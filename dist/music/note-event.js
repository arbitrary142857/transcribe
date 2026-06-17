export class Note {
    pitch;
    duration;
    constructor(pitch, duration) {
        this.pitch = pitch;
        this.duration = duration;
    }
    isEqual(other) {
        if (!(other instanceof Note)) {
            return false;
        }
        return (this.pitch.isEqual(other.pitch) && this.duration.isEqual(other.duration));
    }
    isEnharmonicallyEqual(other) {
        if (!(other instanceof Note)) {
            return false;
        }
        return (this.pitch.isEnharmonicallyEqual(other.pitch) &&
            this.duration.sameLengthAs(other.duration));
    }
}
export class Rest {
    duration;
    constructor(duration) {
        this.duration = duration;
    }
    isEqual(other) {
        if (!(other instanceof Rest)) {
            return false;
        }
        return this.duration.isEqual(other.duration);
    }
    isEnharmonicallyEqual(other) {
        if (!(other instanceof Rest)) {
            return false;
        }
        return this.duration.sameLengthAs(other.duration);
    }
}
