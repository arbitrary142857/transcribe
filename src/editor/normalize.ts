import { notateRest } from "../music/duration.js";
import { Fraction } from "../music/fraction.js";
import type { Melody } from "../music/melody.js";
import { type NoteEvent, Rest } from "../music/note-event.js";
import {
  barLengthOf,
  eventPositions,
  totalLengthOf,
  type EventPosition,
} from "./position.js";

const ZERO = new Fraction(0, 1);

const times = (length: Fraction, by: number) =>
  new Fraction(length.num * by, length.den);
const minOf = (a: Fraction, b: Fraction) => (a.compare(b) <= 0 ? a : b);

/** Rests written for `[from, to)`, cut at each barline it crosses. */
export function restsBetween(
  melody: Melody,
  from: Fraction,
  to: Fraction,
): Rest[] {
  const barLength = barLengthOf(melody.timeSignature);
  const rests: Rest[] = [];
  let cursor = from;

  while (cursor.compare(to) < 0) {
    const bar = Math.floor(
      (cursor.num * barLength.den) / (cursor.den * barLength.num),
    );
    const barStart = times(barLength, bar);
    const chunkEnd = minOf(barStart.add(barLength), to);
    for (const duration of notateRest(
      chunkEnd.difference(cursor),
      cursor.difference(barStart),
      melody.timeSignature,
    )) {
      rests.push(new Rest(duration));
    }
    cursor = chunkEnd;
  }

  return rests;
}

/**
 * Fill any bar the music left half written, and leave exactly one bar of rests
 * past the last note.
 *
 * That spare bar is where the next note goes: it is what makes the score grow
 * without anything ever being inserted, since writing into it is an ordinary
 * edit and a fresh spare appears behind it.
 */
function fitBars(melody: Melody): void {
  const barLength = barLengthOf(melody.timeSignature);
  const positions = eventPositions(melody);

  let lastMusicBar: number | undefined;
  for (const position of positions) {
    if (!(melody.getEvent(position.index) instanceof Rest)) {
      lastMusicBar = position.bar;
    }
  }

  // One bar past the one the last note sits in, or a single bar when there is
  // no music yet at all.
  const target = times(barLength, (lastMusicBar ?? -1) + 2);
  const total = totalLengthOf(melody);
  const overshoot = total.compare(target);

  if (overshoot > 0) {
    // Everything past the music is rests, and `target` is a barline, so this
    // never cuts an event in half.
    const first = positions.find(
      (position) => position.start.compare(target) >= 0,
    );
    if (first) {
      melody.replaceEvents(first.index, melody.eventCount - first.index, []);
    }
  } else if (overshoot < 0) {
    melody.replaceEvents(
      melody.eventCount,
      0,
      restsBetween(melody, total, target),
    );
  }
}

/**
 * Runs of neighbouring rests that should be written as one stretch of silence.
 *
 * A run stops at a barline, because rests are never grouped across one, and
 * skips anything inside a tuplet: a bracket's rests are part of its ratio, and
 * their lengths are not writable without it.
 */
function restRuns(melody: Melody): EventPosition[][] {
  const runs: EventPosition[][] = [];
  let current: EventPosition[] = [];

  const flush = () => {
    if (current.length > 0) runs.push(current);
    current = [];
  };

  for (const position of eventPositions(melody)) {
    const event = melody.getEvent(position.index);
    const plainRest =
      event instanceof Rest &&
      event.duration.tuplet.isNone() &&
      melody.getTupletSpan(position.index).tuplet.isNone();
    const continues =
      plainRest &&
      current.length > 0 &&
      current[current.length - 1]!.bar === position.bar;

    if (!continues) {
      flush();
    }
    if (plainRest) {
      current.push(position);
    }
  }
  flush();

  return runs;
}

/** Rewrite each stretch of silence the way it should be written. */
function renotateRests(melody: Melody): void {
  // Back to front, so rewriting one run cannot shift the indices of the next.
  for (const run of restRuns(melody).reverse()) {
    const start = run[0]!;
    const length = run.reduce((total, { length }) => total.add(length), ZERO);
    const written = notateRest(length, start.offset, melody.timeSignature);

    const unchanged =
      written.length === run.length &&
      written.every((duration, i) =>
        duration.isEqual(melody.getEvent(start.index + i).duration),
      );
    if (unchanged) {
      continue;
    }

    const rests: NoteEvent[] = written.map((duration) => new Rest(duration));
    melody.replaceEvents(start.index, run.length, rests);
  }
}

/**
 * Put the melody back into the shape the editor guarantees: every bar exactly
 * full, silence written the way a copyist would write it, and one spare bar of
 * rests waiting past the last note.
 *
 * Every editing operation ends here, which is what keeps `splitIntoMeasures`
 * from ever having anything to complain about — and so what keeps the user from
 * ever meeting an error.
 */
export function normalize(melody: Melody): void {
  fitBars(melody);
  renotateRests(melody);
}
