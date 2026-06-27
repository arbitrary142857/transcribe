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
  tuplets: { start: number; count: number; numNotes: number; inTimeOf: number }[];
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
