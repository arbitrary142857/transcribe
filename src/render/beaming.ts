/**
 * Which notes share a beam, and where a beam's inner layers break.
 *
 * VexFlow has a `Beam.generateBeams` that answers the first question, and this
 * module exists because it answers it wrongly. It walks the bar adding tick
 * counts, and when a note straddles a group boundary it moves that note into the
 * next group but carries `total - groupSize` forward as the running total —
 * which counts the moved note twice. From then on it is out of step with the bar
 * for good. A bar of `d8 d8 8 | q | 8 8` in 4/4 comes back with *no beams at
 * all*, the last two eighths included, though nothing is wrong with them.
 *
 * A melody here carries exact `Fraction` lengths, so the walk can be done
 * without ticks and without a carry: a group closes when the running offset
 * lands on a boundary, and a note that crosses one simply holds it open. That is
 * also the rule a copyist follows, which is why the syncopated figure above
 * comes out as one beam over three notes rather than as a break inside a note.
 *
 * Nothing here touches VexFlow, so it can be read and tested as what it is: a
 * question about rhythm.
 */

import { type Duration, NoteValue } from "../music/duration.js";
import { Fraction } from "../music/fraction.js";
import type { Measure } from "../music/measure.js";
import { Rest } from "../music/note-event.js";
import type { TimeSignature } from "../music/types.js";

/**
 * One beam, as measure-local event indices.
 *
 * `secondaryBreaks` is indexed into `notes` rather than into the measure,
 * because that is what `Beam.breakSecondaryAt` takes: positions within the
 * beam's own notes, after which its inner layers stop and start again.
 */
export type BeamPlan = {
  readonly notes: number[];
  readonly secondaryBreaks: number[];
};

/**
 * Whether this length has a beam to share: an eighth or anything shorter.
 *
 * Spelled as a named test because the comparison reads backwards. A `NoteValue`
 * is the *denominator* of the note's share of a whole note, so a shorter note
 * carries a larger number — an eighth is 8 and a thirty-second 32. "An eighth or
 * shorter" is therefore `>= Eighth`, and a quarter, at 4, falls out as having no
 * beam, which is what it has.
 */
const carriesABeam = (duration: Duration) =>
  duration.value >= NoteValue.Eighth;

/**
 * The span of one beam group in this meter, as a share of a whole note.
 *
 * Not `beatLengthOf` from the duration module, though the two agree in most
 * meters: that one answers what a player feels, and the two questions come apart
 * exactly where beaming is conventional rather than metrical. 3/8 is three felt
 * beats and one beam group; 4/8 is four felt beats and groups of two. Beaming is
 * how the bar is *written*, so it gets its own rule.
 *
 * Anything with a beat unit of a quarter or longer groups by that unit. Below
 * it, a numerator divisible by three is read as compound and groups in threes —
 * which covers 6/8, 9/8 and 12/8, and takes 3/8 as a single group of three
 * rather than as a compound beat, since the two are written the same way.
 * Everything else pairs up, the usual reading of 4/8, 5/8 and 7/8.
 */
function beamGroupLength({ beats, beatUnit }: TimeSignature): Fraction {
  if (beatUnit <= 4) {
    return new Fraction(1, beatUnit);
  }
  return new Fraction(beats % 3 === 0 ? 3 : 2, beatUnit);
}

/** Whether `offset` sits exactly on a multiple of `step`. */
const onBoundary = (offset: Fraction, step: Fraction) =>
  offset.divide(step).reduce().den === 1;

/**
 * Which bracket each event belongs to, by the index the bracket starts at.
 *
 * `undefined` for an event under no bracket. The value is only ever compared for
 * equality — what matters is whether two neighbours are divided the same way,
 * not which ratio divides them.
 */
function bracketOf(measure: Measure): (undefined | number)[] {
  const owner: (undefined | number)[] = measure.events.map(() => undefined);
  for (const span of measure.tuplets) {
    for (let i = span.start; i < span.start + span.count; i++) {
      owner[i] = span.start;
    }
  }
  return owner;
}

/**
 * Plan the beams of one measure.
 *
 * A rest ends a group rather than being beamed over: beaming across silence is a
 * deliberate effect, and nothing here asks for it. So does a quarter and
 * anything longer, which has no beam to share.
 */
export function planBeams(measure: Measure, meter: TimeSignature): BeamPlan[] {
  const groupLength = beamGroupLength(meter);
  const brackets = bracketOf(measure);

  const plans: BeamPlan[] = [];
  let run: number[] = [];
  let offset = new Fraction(0, 1);

  /** Close the run, keeping it only if there are two notes to join. */
  const flush = () => {
    if (run.length > 1) {
      const secondaryBreaks: number[] = [];
      for (let i = 0; i < run.length - 1; i++) {
        // The inner beams stop wherever the division changes, so that a triplet
        // beamed in with straight notes still shows where it starts. The
        // primary beam is untouched — VexFlow only consults these breaks for
        // the second layer and below — so the group still reads as one gesture.
        if (brackets[run[i]!] !== brackets[run[i + 1]!]) {
          secondaryBreaks.push(i);
        }
      }
      plans.push({ notes: run, secondaryBreaks });
    }
    run = [];
  };

  measure.events.forEach((event, index) => {
    offset = offset.add(event.duration.asWholeNoteFraction());

    if (event instanceof Rest || !carriesABeam(event.duration)) {
      flush();
      return;
    }

    run.push(index);
    // Closed on landing, never on crossing: a note that runs past a boundary
    // holds its group open to the next one a note actually ends on.
    if (onBoundary(offset, groupLength)) {
      flush();
    }
  });
  flush();

  return plans;
}
