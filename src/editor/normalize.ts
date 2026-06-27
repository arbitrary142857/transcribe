import { notateRest } from "../music/duration.js";
import { Fraction, whole } from "../music/fraction.js";
import type { Melody } from "../music/melody.js";
import { type NoteEvent, Rest } from "../music/note-event.js";
import {
  barLengthOf,
  eventPositions,
  totalLengthOf,
  type EventPosition,
} from "./position.js";

const ZERO = new Fraction(0, 1);

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
    const bar = Math.floor(cursor.divide(barLength).toNumber());
    const barStart = barLength.multiply(whole(bar));
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
 * Fill out the bar the events leave half written, and nothing more.
 *
 * The melody's length is set when it is made and kept thereafter: bars are
 * never added past the music and never taken away behind it, because the bar
 * count is chosen up front — it is what the timing marks were measured
 * against, and a length that moved underneath them would un-measure them.
 * The count therefore lives in the event list itself, which is what lets undo,
 * saving and key changes carry it without knowing it exists.
 */
function fitBars(melody: Melody): void {
  const barLength = barLengthOf(melody.timeSignature);
  const total = totalLengthOf(melody);

  const bars = Math.ceil(total.divide(barLength).toNumber());
  const target = barLength.multiply(whole(bars));

  if (total.compare(target) < 0) {
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
 * full, silence written the way a copyist would write it, and the length it
 * was given kept.
 *
 * Every editing operation ends here, which is what keeps `splitIntoMeasures`
 * from ever having anything to complain about — and so what keeps the user from
 * ever meeting an error.
 */
export function normalize(melody: Melody): void {
  fitBars(melody);
  renotateRests(melody);
}
