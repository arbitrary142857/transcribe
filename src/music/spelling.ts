import type { KeySignature } from "./key-signature.js";
import { splitIntoMeasures } from "./measure.js";
import type { Melody } from "./melody.js";
import { Note, type NoteEvent } from "./note-event.js";
import { LETTER_SEMITONE, Pitch } from "./pitch.js";
import type { Accidental, LetterName } from "./types.js";

const LETTERS: readonly LetterName[] = ["C", "D", "E", "F", "G", "A", "B"];

/**
 * The accidental environment at one point inside one measure: the key, plus the
 * alteration last sounded for each letter in each octave earlier in that
 * measure. Accidentals do not carry across a barline, so a context is only ever
 * built from a single measure.
 */
export type SpellingContext = {
  readonly key: KeySignature;
  /** Keyed by letter and octave, e.g. `"F4"`. */
  readonly alterations: ReadonlyMap<string, Accidental>;
};

const alterationKey = (letter: LetterName, octave: number) =>
  `${letter}${octave}`;

/**
 * Build a context from the events of one measure preceding the note in
 * question.
 *
 * Recording every note — not only the ones that printed an accidental — is what
 * makes this exact. Once a note has sounded, the alteration in effect for its
 * letter and octave *is* its accidental, whether the accidental was written or
 * merely implied by the key signature.
 */
export function spellingContext(
  key: KeySignature,
  precedingEvents: readonly NoteEvent[],
): SpellingContext {
  const alterations = new Map<string, Accidental>();
  for (const event of precedingEvents) {
    if (event instanceof Note) {
      const { letter, accidental, octave } = event.pitch;
      alterations.set(alterationKey(letter, octave), accidental);
    }
  }
  return { key, alterations };
}

/** The alteration a player currently applies to this letter in this octave. */
export function alterationInEffect(
  context: SpellingContext,
  letter: LetterName,
  octave: number,
): Accidental {
  return (
    context.alterations.get(alterationKey(letter, octave)) ??
    context.key.alterationFor(letter)
  );
}

/** Whether writing `pitch` at this point would print an accidental. */
export function requiresAccidental(
  context: SpellingContext,
  pitch: Pitch,
): boolean {
  return (
    pitch.accidental !== alterationInEffect(context, pitch.letter, pitch.octave)
  );
}

/**
 * Every spelling of an absolute semitone (C0 = 0), in letter order C to B.
 *
 * A letter can spell the semitone only when the gap between them is one of the
 * permitted accidentals, and the octave follows from the letter rather than the
 * sound — which is why semitone 47 yields both B3 and C♭4.
 */
export function enharmonicSpellings(
  semitone: number,
  maxAccidental: 1 | 2 = 2,
): Pitch[] {
  const spellings: Pitch[] = [];
  for (const letter of LETTERS) {
    for (
      let accidental = -maxAccidental;
      accidental <= maxAccidental;
      accidental++
    ) {
      const octave = (semitone - LETTER_SEMITONE[letter] - accidental) / 12;
      if (Number.isInteger(octave)) {
        spellings.push(new Pitch(letter, accidental as Accidental, octave));
      }
    }
  }
  return spellings;
}

/**
 * How undesirable a spelling is here, compared lexicographically — lower wins.
 * Printing an accidental dominates every other consideration; the rest only
 * separate spellings that would print equally many.
 */
function spellingCost(pitch: Pitch, context: SpellingContext): number[] {
  const preferSharps = context.key.fifths() >= 0;
  const runsAgainstKey =
    pitch.accidental !== 0 && pitch.accidental > 0 !== preferSharps;

  return [
    requiresAccidental(context, pitch) ? 1 : 0,
    Math.abs(pitch.accidental) === 2 ? 1 : 0,
    runsAgainstKey ? 1 : 0,
    Math.abs(pitch.accidental),
  ];
}

function compareCosts(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const difference = a[i]! - b[i]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/**
 * The spelling of `semitone` (C0 = 0) printing the fewest accidentals here.
 *
 * Every candidate sounds the same pitch, so this only ever chooses how to write
 * a note — never which note to write.
 */
export function spellSemitone(
  semitone: number,
  context: SpellingContext,
): Pitch {
  const candidates = enharmonicSpellings(semitone);
  let best = candidates[0];
  if (!best) {
    throw new RangeError(`No spelling of semitone ${semitone}`);
  }

  let bestCost = spellingCost(best, context);
  for (const candidate of candidates.slice(1)) {
    const cost = spellingCost(candidate, context);
    if (compareCosts(cost, bestCost) < 0) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}

/** As `spellSemitone`, for a MIDI note number (C4 = 60). */
export function spellMidi(midi: number, context: SpellingContext): Pitch {
  return spellSemitone(midi - 12, context);
}

/**
 * The spelling to hand to `melody.setPitch(index, …)`: resolves the tied group
 * containing `index` and spells against the measure holding the group's first
 * note, since that is where the accidental would be printed.
 */
export function spellForMelodyEvent(
  melody: Melody,
  index: number,
  midi: number,
): Pitch {
  const first = melody.getTiedGroup(index)[0]!;

  const measure = splitIntoMeasures(melody).find(
    (candidate) =>
      first >= candidate.startIndex &&
      first < candidate.startIndex + candidate.events.length,
  );
  if (!measure) {
    throw new RangeError(`No measure contains event ${first}`);
  }

  const preceding = measure.events.slice(0, first - measure.startIndex);
  return spellMidi(midi, spellingContext(melody.keySignature, preceding));
}
