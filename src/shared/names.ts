/**
 * A name for an account that has none.
 *
 * Nobody is made to choose a username: one is minted at sign-in, so the corner
 * of every page shows a name from the first moment and usernames are
 * self-evidently a thing, and the profile page is where it is changed. Two
 * musical words and a hyphen — `legato-cadenza` — which reads as a name rather
 * than as an id, and takes a number when that pair is already somebody's.
 *
 * The words are plain, lowercase and ASCII, none of them reserved and none
 * unkind, and every pairing passes `usernameProblem`; a test walks the whole
 * product to prove it, and walks it again for anything the *join* makes that
 * neither half says on its own — three adjectives came out of the list for
 * exactly that. The random choice is handed in, so a test can say which name
 * it expects and the Worker can use `randomBelow`.
 *
 * **Every word is three characters to nine, and that is a budget rather than
 * a style.** Nine and nine and four digits and three hyphens is twenty-four,
 * which is `USERNAME.max` exactly; a tenth character in one word breaks the
 * cap in one name out of thousands, silently. A test holds the line.
 */

export const ADJECTIVES: readonly string[] = [
  "adagio", "allegro", "amabile", "andante", "animato", "ardent", "augmented",
  "blue", "bold", "bowed", "brassy", "bright", "brisk", "broken", "cantabile",
  "chromatic", "damped", "diatonic", "dorian", "dotted", "dulcet", "eighth",
  "fiery", "flat", "fleet", "forte", "fretted", "giocoso", "golden", "grave",
  "grazioso", "half", "harmonic", "hushed", "ionian", "jaunty", "larghetto",
  "largo", "legato", "lento", "lilting", "locrian", "lydian", "major",
  "marcato", "minor", "misty", "modal", "moderato", "molto",
  "muted", "natural", "nimble", "open", "perfect", "phrygian", "piano",
  "pizzicato", "placid", "plucked", "presto", "quarter", "quiet", "resonant",
  "rubato", "sharp", "silver", "slurred", "smooth", "soaring", "soft",
  "solemn", "sostenuto", "spiccato", "staccato", "steady",
  "stormy", "sublime", "sunlit", "swelling", "swift", "tacet", "tender",
  "tenuto", "tranquil", "triple", "tuneful", "velvet", "vibrant",
  "vivace", "vivid", "whole", "wistful",
];

export const NOUNS: readonly string[] = [
  "anthem", "aria", "arpeggio", "ballad", "bassline", "baton", "beat",
  "bellows", "bridge", "bugle", "cadence", "cadenza", "canon", "cantata",
  "capo", "carol", "cello", "chant", "chime", "chord", "chorus", "clarinet",
  "clef", "coda", "concerto", "cornet", "cymbal", "descant", "downbeat",
  "drone", "drum", "duet", "encore", "etude", "fanfare", "fermata", "fiddle",
  "fifth", "finale", "flute", "fugue", "gavotte", "gigue", "harmony", "harp",
  "horn", "hymn", "interval", "jig", "kazoo", "ledger", "lute", "lullaby",
  "lyre", "madrigal", "mandolin", "march", "marimba", "mazurka", "measure",
  "medley", "melody", "metronome", "minuet", "motif", "nocturne", "nonet",
  "oboe", "octave", "octet", "opus", "oratorio", "organ", "ostinato", "overture",
  "partita", "pedal", "phrase", "piccolo", "pitch", "polka", "prelude",
  "quartet", "quaver", "quintet", "refrain", "reprise", "requiem", "rest",
  "rhapsody", "rhythm", "rondo", "rosin", "sarabande", "scale", "scherzo",
  "score", "segno", "septet", "sextet", "shanty", "sitar", "sonata", "soprano",
  "stanza", "staff", "string", "suite", "symphony", "tabla", "tempo", "theme",
  "timbre", "toccata", "tonic", "treble", "tremolo", "triad", "trill",
  "trio", "trumpet", "tuba", "tuning", "ukulele", "upbeat", "verse", "vibrato",
  "viola", "violin", "waltz", "whistle", "xylophone", "zither",
];

/**
 * How many plain pairs are offered before one of them starts taking numbers.
 *
 * Three, and it is the *third* pair that gets numbered rather than a fourth
 * fresh one: a suffix exists to rescue a pair the database has just refused,
 * and there are nine hundred rescues available for any pair, so a name that
 * has failed four times over is not a pair problem.
 */
export const BARE_TRIES = 3;

/** A whole number below `n`, however the caller comes by its randomness. */
export type Pick = (n: number) => number;

/**
 * Every name to try, in order: plain pairs, then the last of them numbered.
 *
 * A list rather than a function of an attempt number, because "the last pair
 * drawn" is a fact about the sequence and not about any one call. The caller
 * walks it and stops at the first the database accepts.
 */
export function mintNames(pick: Pick): string[] {
  const pairs = Array.from(
    { length: BARE_TRIES },
    () => `${word(ADJECTIVES, pick)}-${word(NOUNS, pick)}`,
  );
  const last = pairs[pairs.length - 1]!;
  return [...pairs, `${last}-${digits(pick, 3)}`, `${last}-${digits(pick, 4)}`];
}

const word = (list: readonly string[], pick: Pick): string =>
  list[pick(list.length)] ?? list[0]!;

/**
 * A number of exactly `width` digits, never fewer.
 *
 * Never fewer is the whole of it: `-007` would be three characters spent to
 * say one, and a four-digit suffix that could come out as `-42` would make
 * "the longest name is twenty-four" true only on average.
 */
function digits(pick: Pick, width: number): number {
  const least = 10 ** (width - 1);
  return least + pick(least * 9);
}

/**
 * The largest whole number of `n`s that fits in a 32-bit draw.
 *
 * Everything at or above this is thrown away rather than folded back in with
 * a modulo. 2^32 is not a multiple of 93, so a bare `draw % 93` would hand
 * the first few adjectives a slightly larger slice of the range than the
 * rest — a bias too small to notice and too easy to avoid.
 */
export const drawLimit = (n: number): number => Math.floor(2 ** 32 / n) * n;

/**
 * A whole number below `n`, from the platform's cryptographic randomness.
 *
 * Not `Math.random()`, which is what this replaced: it is not required to be
 * unpredictable, and a name minted for somebody is a small thing to be able
 * to guess but not one worth being able to guess.
 */
export function randomBelow(n: number): number {
  const limit = drawLimit(n);
  const drawn = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(drawn);
    // The rejected tail is under `n` wide, so this ends: each round has at
    // worst a one in two chance of landing inside the limit.
    if (drawn[0]! < limit) return drawn[0]! % n;
  }
}
