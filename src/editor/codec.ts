import { Duration, NoteValue } from "../music/duration.js";
import { KeySignature } from "../music/key-signature.js";
import { Melody } from "../music/melody.js";
import { Note, type NoteEvent, Rest, UnpitchedNote } from "../music/note-event.js";
import { Pitch } from "../music/pitch.js";
import { Tuplet } from "../music/tuplet.js";
import type { Accidental, LetterName, Mode, TimeSignature } from "../music/types.js";

type PitchJson = { letter: LetterName; accidental: Accidental; octave: number };
type DurationJson = { value: number; dots: number; ratio?: [number, number] };
type EventJson =
  | { kind: "note"; pitch: PitchJson; duration: DurationJson }
  | { kind: "unpitched"; duration: DurationJson }
  | { kind: "rest"; duration: DurationJson };
type TupletJson = {
  start: number;
  count: number;
  numNotes: number;
  inTimeOf: number;
};

/**
 * A melody as plain data.
 *
 * Everything that distinguishes one melody from another is here, including how
 * each note is spelled rather than only how it sounds — a G-flat and an F-sharp
 * are different melodies, and a round trip must not quietly pick one.
 */
export type MelodyJson = {
  key: PitchJson & { mode: Mode };
  meter: TimeSignature;
  events: EventJson[];
  /** Indices tied to the event after them. */
  ties: number[];
  tuplets: TupletJson[];
};

const pitchJson = (pitch: Pitch): PitchJson => ({
  letter: pitch.letter,
  accidental: pitch.accidental,
  octave: pitch.octave,
});

const durationJson = (duration: Duration): DurationJson => ({
  value: duration.value,
  dots: duration.dots,
  ...(duration.tuplet.isNone()
    ? {}
    : { ratio: [duration.tuplet.numNotes, duration.tuplet.inTimeOf] as [number, number] }),
});

function eventJson(event: NoteEvent): EventJson {
  const duration = durationJson(event.duration);
  if (event instanceof Note) {
    return { kind: "note", pitch: pitchJson(event.pitch), duration };
  }
  return event instanceof UnpitchedNote
    ? { kind: "unpitched", duration }
    : { kind: "rest", duration };
}

export function encode(melody: Melody): MelodyJson {
  const events: EventJson[] = [];
  const ties: number[] = [];
  for (let i = 0; i < melody.eventCount; i++) {
    events.push(eventJson(melody.getEvent(i)));
    if (i < melody.eventCount - 1 && melody.isTiedToNext(i)) {
      ties.push(i);
    }
  }

  return {
    key: { ...pitchJson(melody.keySignature.tonic), mode: melody.keySignature.mode },
    meter: {
      beats: melody.timeSignature.beats,
      beatUnit: melody.timeSignature.beatUnit,
    },
    events,
    ties,
    tuplets: melody.tupletSpans().map(({ start, count, tuplet }) => ({
      start,
      count,
      numNotes: tuplet.numNotes,
      inTimeOf: tuplet.inTimeOf,
    })),
  };
}

const readPitch = (json: PitchJson) =>
  new Pitch(json.letter, json.accidental, json.octave);

const readDuration = (json: DurationJson) =>
  new Duration(
    json.value as (typeof NoteValue)[keyof typeof NoteValue],
    json.dots,
    json.ratio ? new Tuplet(json.ratio[0], json.ratio[1]) : Tuplet.None,
  );

function readEvent(json: EventJson): NoteEvent {
  const duration = readDuration(json.duration);
  switch (json.kind) {
    case "note":
      return new Note(readPitch(json.pitch), duration);
    case "unpitched":
      return new UnpitchedNote(duration);
    default:
      return new Rest(duration);
  }
}

// ---- reading a melody nobody vouched for --------------------------------
//
// `decode()` below trusts what it is handed: it casts the note value, takes
// the mode on faith, and lets `Melody` throw about the rest. That was honest
// while undo was its only caller, since undo reads back what `encode()` wrote
// a moment earlier. It stops being honest the moment a stranger can POST one.
//
// This is what earns that trust. It answers one question -- is this a
// `MelodyJson`? -- and answers it about every field, returning a *new* object
// built only from what it recognised, so nothing that rode along in the
// request survives into the database.
//
// It is not the whole story: ties and tuplet brackets carry musical rules no
// amount of shape-checking covers (a tie needs matching pitches; a bracket
// needs a writable total length), and `Melody` enforces those by throwing. The
// caller still needs its `decode()` in a try/catch. What this removes is the
// far larger class of nonsense that would otherwise reach that point at all.

const LETTERS: ReadonlySet<string> = new Set([
  "C",
  "D",
  "E",
  "F",
  "G",
  "A",
  "B",
]);

const NOTE_VALUES: ReadonlySet<number> = new Set(Object.values(NoteValue));

/** Octaves with a piano's eight in the middle and room either side. */
const OCTAVE_MIN = -1;
const OCTAVE_MAX = 10;

/**
 * The editor writes at most one dot today; this allows three regardless.
 *
 * Deliberately not a mirror of the duration grid. A validator that tracked the
 * palette would need widening every time the palette grew, and until somebody
 * remembered, real music would be turned away with no clue why. Three is where
 * the notation itself stops meaning much -- a triple dot is already a
 * curiosity -- and `asWholeNoteFraction()` handles any of them, so the slack
 * costs nothing.
 */
const MAX_DOTS = 3;

/** A bar of sixty-four beats is not a bar anyone means. */
const MAX_BEATS = 64;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A whole number, and so not NaN, not Infinity, not a string of digits. */
const isWhole = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

function readPitchJson(json: unknown): PitchJson | undefined {
  if (!isObject(json)) return undefined;
  const { letter, accidental, octave } = json;
  if (typeof letter !== "string" || !LETTERS.has(letter)) return undefined;
  if (!isWhole(accidental) || accidental < -2 || accidental > 2) return undefined;
  if (!isWhole(octave) || octave < OCTAVE_MIN || octave > OCTAVE_MAX) {
    return undefined;
  }
  return {
    letter: letter as LetterName,
    accidental: accidental as Accidental,
    octave,
  };
}

function readDurationJson(json: unknown): DurationJson | undefined {
  if (!isObject(json)) return undefined;
  const { value, dots, ratio } = json;
  if (!isWhole(value) || !NOTE_VALUES.has(value)) return undefined;
  if (!isWhole(dots) || dots < 0 || dots > MAX_DOTS) return undefined;
  if (ratio === undefined) {
    return { value, dots };
  }
  if (!Array.isArray(ratio) || ratio.length !== 2) return undefined;
  const [numNotes, inTimeOf] = ratio as unknown[];
  if (!isWhole(numNotes) || numNotes < 1) return undefined;
  if (!isWhole(inTimeOf) || inTimeOf < 1) return undefined;
  return { value, dots, ratio: [numNotes, inTimeOf] };
}

function readEventJson(json: unknown): EventJson | undefined {
  if (!isObject(json)) return undefined;
  const duration = readDurationJson(json.duration);
  if (duration === undefined) return undefined;

  switch (json.kind) {
    case "note": {
      const pitch = readPitchJson(json.pitch);
      return pitch === undefined ? undefined : { kind: "note", pitch, duration };
    }
    case "unpitched":
      return { kind: "unpitched", duration };
    case "rest":
      return { kind: "rest", duration };
    default:
      return undefined;
  }
}

function readMeterJson(json: unknown): TimeSignature | undefined {
  if (!isObject(json)) return undefined;
  const { beats, beatUnit } = json;
  if (!isWhole(beats) || beats < 1 || beats > MAX_BEATS) return undefined;
  if (!isWhole(beatUnit) || !NOTE_VALUES.has(beatUnit)) return undefined;
  return { beats, beatUnit };
}

/**
 * Tie indices.
 *
 * Each names the event it joins to the one after, so the last event cannot
 * hold one and an empty melody can hold none at all. Repeats are refused
 * rather than collapsed: a list saying the same thing twice is not a list
 * anything here wrote, and accepting it would be guessing at what was meant.
 */
function readTiesJson(json: unknown, eventCount: number): number[] | undefined {
  if (!Array.isArray(json)) return undefined;
  const ties: number[] = [];
  const seen = new Set<number>();
  for (const index of json as unknown[]) {
    if (!isWhole(index) || index < 0 || index >= eventCount - 1) return undefined;
    if (seen.has(index)) return undefined;
    seen.add(index);
    ties.push(index);
  }
  return ties;
}

function readTupletsJson(
  json: unknown,
  eventCount: number,
): TupletJson[] | undefined {
  if (!Array.isArray(json)) return undefined;
  const tuplets: TupletJson[] = [];
  for (const span of json as unknown[]) {
    if (!isObject(span)) return undefined;
    const { start, count, numNotes, inTimeOf } = span;
    if (!isWhole(start) || start < 0) return undefined;
    if (!isWhole(count) || count < 1) return undefined;
    // A bracket over events that are not there is a RangeError waiting inside
    // groupTuplet(), which the caller would have to answer for as a 500.
    if (start + count > eventCount) return undefined;
    if (!isWhole(numNotes) || numNotes < 1) return undefined;
    if (!isWhole(inTimeOf) || inTimeOf < 1) return undefined;
    tuplets.push({ start, count, numNotes, inTimeOf });
  }
  return tuplets;
}

/**
 * Whether this really is a melody, and a copy of it if so.
 *
 * A copy rather than the thing itself, because the caller's object came off
 * the wire: rebuilding it field by field is what guarantees that these five
 * keys, and nothing else the sender attached, are what reaches storage.
 */
export function parseMelodyJson(json: unknown): MelodyJson | undefined {
  if (!isObject(json)) return undefined;

  const key = readPitchJson(json.key);
  if (key === undefined) return undefined;
  const mode = isObject(json.key) ? json.key.mode : undefined;
  if (mode !== "major" && mode !== "minor") return undefined;

  const meter = readMeterJson(json.meter);
  if (meter === undefined) return undefined;

  if (!Array.isArray(json.events)) return undefined;
  const events: EventJson[] = [];
  for (const event of json.events as unknown[]) {
    const read = readEventJson(event);
    if (read === undefined) return undefined;
    events.push(read);
  }

  const ties = readTiesJson(json.ties, events.length);
  if (ties === undefined) return undefined;

  const tuplets = readTupletsJson(json.tuplets, events.length);
  if (tuplets === undefined) return undefined;

  return { key: { ...key, mode }, meter, events, ties, tuplets };
}

export function decode(json: MelodyJson): Melody {
  const melody = new Melody(
    new KeySignature(readPitch(json.key), json.key.mode),
    json.meter,
    json.events.map(readEvent),
  );

  // Ties before brackets, matching how they are made: neither depends on the
  // other, but both are checked against the events, which exist by now.
  for (const index of json.ties) {
    melody.tie(index);
  }
  for (const { start, count } of json.tuplets) {
    melody.groupTuplet(start, count);
  }

  return melody;
}
