export const SAMPLE_RATE = 44_100;
const AMPLITUDE = 0.3;
export function writeTone(buffer, startSample, frequency, durationSeconds, sampleRate = SAMPLE_RATE) {
    const sampleCount = Math.ceil(durationSeconds * sampleRate);
    const attack = Math.min(0.01, durationSeconds * 0.1);
    let release = Math.min(0.03, durationSeconds * 0.2);
    if (attack + release > durationSeconds) {
        release = Math.max(0, durationSeconds - attack);
    }
    for (let i = 0; i < sampleCount; i++) {
        const index = startSample + i;
        if (index >= buffer.length) {
            break;
        }
        const time = i / sampleRate;
        const shaped = AMPLITUDE * noteEnvelope(time, durationSeconds, attack, release);
        buffer[index] =
            (buffer[index] ?? 0) +
                shaped * Math.sin(2 * Math.PI * frequency * time);
    }
}
function noteEnvelope(time, duration, attack, release) {
    if (time < attack) {
        return attack === 0 ? 1 : time / attack;
    }
    if (release > 0 && time > duration - release) {
        return Math.max(0, (duration - time) / release);
    }
    return 1;
}
