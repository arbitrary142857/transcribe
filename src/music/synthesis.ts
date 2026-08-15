/**
 * Where the project decides what a synthesised note sounds like.
 *
 * Two voices, and both are plain writers into a `Float32Array` rather than
 * graphs of oscillator and gain nodes. That is what lets the metronome, the
 * demo's wav file and the keyboard's piano share one answer to the question —
 * and, since a buffer of samples is just arithmetic, what lets the answer be
 * tested without a browser anywhere near it.
 *
 * `writeTone` is a sine under a flat-topped envelope: right for a click, and
 * for anything that only has to mark a moment. `writePianoTone` is a struck
 * string, for the keyboard.
 */

export const SAMPLE_RATE = 44_100;

const AMPLITUDE = 0.3;

export function writeTone(
  buffer: Float32Array,
  startSample: number,
  frequency: number,
  durationSeconds: number,
  sampleRate = SAMPLE_RATE,
): void {
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
    const shaped =
      AMPLITUDE * noteEnvelope(time, durationSeconds, attack, release);
    buffer[index] =
      (buffer[index] ?? 0) +
      shaped * Math.sin(2 * Math.PI * frequency * time);
  }
}

function noteEnvelope(
  time: number,
  duration: number,
  attack: number,
  release: number,
): number {
  if (time < attack) {
    return attack === 0 ? 1 : time / attack;
  }
  if (release > 0 && time > duration - release) {
    return Math.max(0, (duration - time) / release);
  }
  return 1;
}

// ---- a struck string ------------------------------------------------------
//
// What separates a piano from a sine, roughly in order of how much each one
// matters to the ear:
//
//  1. It decays from the instant it is struck, with no held part at all. A
//     flat-topped envelope is the single loudest tell that something is
//     synthetic.
//  2. Its partials are not exact multiples of the fundamental. A real string
//     is stiff as well as flexible, so partial n sits at n·f·√(1 + Bn²) rather
//     than at n·f. This is what gives a piano its shimmer; without it the tone
//     is an organ.
//  3. Its partials fade at different rates, the high ones first. So the attack
//     is bright and the tail is nearly a sine — the "ping" that says piano.
//  4. It is struck about a seventh of the way along, which silences every
//     seventh partial and hollows the tone out.
//  5. Two or three strings are struck per note, tuned very slightly apart, and
//     the slow beating between them is what stops the note sounding dead.
//  6. The hammer makes a noise of its own, a few milliseconds of thump with no
//     pitch, before any of the above is audible.
//
// None of this is a model of a piano. It is the six things that are cheap to
// compute and that the ear notices, which is a different and much smaller list.

/** Beyond this the partials are inaudible and only cost time. */
const MAX_PARTIALS = 14;

/**
 * String stiffness, as the coefficient in n·f·√(1 + Bn²).
 *
 * Real values run from about 0.00005 on the wound bass strings to over 0.001 at
 * the top. One value across the range is a simplification, chosen at the low
 * end of the middle: too much and the tone turns bell-like.
 */
const INHARMONICITY = 0.00015;

/** Which partial the hammer's striking point silences. */
const STRUCK_AT = 7;

/** How far apart a note's strings are tuned, as a fraction of the pitch. */
const UNISON_SPREAD = 0.0006;

/** Partials up to here get a second string; above it the beating is inaudible. */
const UNISON_PARTIALS = 6;

const HAMMER_SECONDS = 0.012;
const HAMMER_LEVEL = 0.12;
const ATTACK_SECONDS = 0.004;
/** The tail is faded over this, so cutting a note short cannot click. */
const FADE_SECONDS = 0.02;

/**
 * How long to let a note ring before there is nothing left to hear.
 *
 * Exposed because it decides how much buffer the caller has to hold, and a bass
 * note needs several times what a treble note does.
 */
export function pianoToneSeconds(frequency: number): number {
  return Math.min(4, Math.max(0.45, decayOf(frequency) * 3.2));
}

/**
 * How much shorter each octave upward rings.
 *
 * A real piano is far more extreme than this — its top octave is gone in well
 * under a second while its bottom rings for twenty — but a keyboard being used
 * to find pitches is played up and down in steps, and at anything like the true
 * spread the notes of one phrase audibly have different lengths, which draws
 * attention to itself rather than to the pitch. Understated on purpose.
 */
const REGISTER_TILT = 0.28;

/** How long the fundamental takes to fall to about a third of its loudness. */
function decayOf(frequency: number): number {
  return Math.min(
    1.25,
    Math.max(0.12, 0.55 * (440 / frequency) ** REGISTER_TILT),
  );
}

/**
 * Noise for the hammer, drawn from the pitch rather than at random.
 *
 * A note has to sound the same every time it is played, or a buffer kept from
 * the last press would differ from one rendered fresh — and the keyboard keeps
 * exactly such buffers.
 */
function hammerNoise(seed: number): () => number {
  let state = (Math.floor(seed * 1000) % 2147483647) + 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state / 2147483647) * 2 - 1;
  };
}

/**
 * Write a piano note into `buffer`, added to whatever is already there.
 *
 * `durationSeconds` is how much of the note to write, not how long it rings:
 * the note decays on its own schedule and is faded out at the end of that
 * window, so a caller that wants the whole thing asks `pianoToneSeconds` for
 * the length first.
 */
export function writePianoTone(
  buffer: Float32Array,
  startSample: number,
  frequency: number,
  durationSeconds: number,
  sampleRate = SAMPLE_RATE,
): void {
  if (durationSeconds < 0) {
    throw new RangeError("durationSeconds must not be negative");
  }
  const sampleCount = Math.min(
    Math.ceil(durationSeconds * sampleRate),
    Math.max(0, buffer.length - startSample),
  );
  if (sampleCount === 0) {
    return;
  }

  const decay = decayOf(frequency);
  // Stop below the Nyquist frequency: a partial above it does not fold neatly
  // back down, it comes back as a pitch that was never played.
  const partials = Math.max(
    1,
    Math.min(MAX_PARTIALS, Math.floor((sampleRate * 0.45) / frequency)),
  );

  const strings: { frequency: number; amplitude: number; decay: number }[] = [];
  let total = 0;
  for (let n = 1; n <= partials; n++) {
    const stretched = n * frequency * Math.sqrt(1 + INHARMONICITY * n * n);
    if (stretched >= sampleRate / 2) break;

    // Falling off with n, and notched where the hammer strikes.
    const amplitude =
      (1 / n ** 1.3) * Math.abs(Math.sin((Math.PI * n) / STRUCK_AT));
    if (amplitude < 0.0015) continue;

    // Higher partials shed their energy faster, which is what turns a bright
    // attack into a mellow tail.
    const partialDecay = decay / n ** 0.55;

    const copies = n <= UNISON_PARTIALS ? 2 : 1;
    for (let copy = 0; copy < copies; copy++) {
      strings.push({
        // The second string of a pair is tuned a shade sharp, and the two beat
        // against each other slowly.
        frequency: stretched * (copy === 0 ? 1 : 1 + UNISON_SPREAD),
        amplitude: amplitude / copies,
        decay: partialDecay,
      });
    }
    total += amplitude;
  }

  // Scaled so the partials summed cannot leave the range a sample holds,
  // whatever the register decided to include.
  const scale = (AMPLITUDE * 1.6) / Math.max(total, 1e-6);
  const noise = hammerNoise(frequency);
  const hammerSamples = Math.floor(HAMMER_SECONDS * sampleRate);
  const fadeFrom = Math.max(0, durationSeconds - FADE_SECONDS);

  for (let i = 0; i < sampleCount; i++) {
    const time = i / sampleRate;

    let value = 0;
    for (const string of strings) {
      value +=
        string.amplitude *
        Math.exp(-time / string.decay) *
        Math.sin(2 * Math.PI * string.frequency * time);
    }
    value *= scale;

    if (i < hammerSamples) {
      // A short burst under its own steep decay, so it reads as the hammer
      // arriving rather than as a layer of hiss.
      value += noise() * HAMMER_LEVEL * (1 - i / hammerSamples) ** 2;
    }

    // Fast, but not instant: a step at sample zero is a click of its own.
    if (time < ATTACK_SECONDS) {
      value *= time / ATTACK_SECONDS;
    }
    if (time > fadeFrom && FADE_SECONDS > 0) {
      value *= Math.max(0, (durationSeconds - time) / FADE_SECONDS);
    }

    const index = startSample + i;
    buffer[index] = (buffer[index] ?? 0) + value;
  }
}
