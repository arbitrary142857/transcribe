import { Fraction } from "./fraction.js";
import type { Melody } from "./melody.js";
import type { NoteEvent } from "./note-event.js";

const ZERO = new Fraction(0, 1);

export class MeasureOverflowError extends Error {
  constructor(
    public readonly eventIndex: number,
    public readonly measureStartIndex: number,
    public readonly overflow: Fraction,
  ) {
    super(
      `Event at melody index ${eventIndex} overflows measure starting at index ${measureStartIndex} by ${overflow}`,
    );
    this.name = "MeasureOverflowError";
  }
}

export class IncompleteMeasureError extends Error {
  constructor(
    public readonly measureStartIndex: number,
    public readonly filled: Fraction,
    public readonly needed: Fraction,
  ) {
    super(
      `Melody ends with incomplete measure starting at index ${measureStartIndex}: filled ${filled}, needs ${needed} more to complete the measure`,
    );
    this.name = "IncompleteMeasureError";
  }
}

export class Measure {
  constructor(
    public readonly startIndex: number,
    public readonly events: readonly NoteEvent[],
    public readonly tiedToNext: ReadonlySet<number>,
    public readonly tiedToPrevBar: boolean,
    public readonly tiedToNextBar: boolean,
  ) {}
}

function buildLocalTiedToNext(
  melody: Melody,
  startIndex: number,
  eventCount: number,
): ReadonlySet<number> {
  const tied = new Set<number>();
  for (let j = 0; j < eventCount - 1; j++) {
    if (melody.isTiedToNext(startIndex + j)) {
      tied.add(j);
    }
  }
  return tied;
}

export function splitIntoMeasures(melody: Melody): Measure[] {
  const { beats, beatUnit } = melody.timeSignature;
  const measureLength = new Fraction(beats, beatUnit);

  const measures: Measure[] = [];
  let runningTotal = ZERO;
  const buffer: NoteEvent[] = [];
  let measureStartIndex = 0;

  for (let i = 0; i < melody.eventCount; i++) {
    const event = melody.getEvent(i);
    runningTotal = runningTotal.add(event.duration.asWholeNoteFraction());

    if (runningTotal.compare(measureLength) > 0) {
      throw new MeasureOverflowError(
        i,
        measureStartIndex,
        runningTotal.difference(measureLength),
      );
    }

    buffer.push(event);

    if (runningTotal.equals(measureLength)) {
      const eventCount = buffer.length;
      const lastLocalIndex = eventCount - 1;
      measures.push(
        new Measure(
          measureStartIndex,
          [...buffer],
          buildLocalTiedToNext(melody, measureStartIndex, eventCount),
          measureStartIndex !== 0 && melody.isTiedToPrev(measureStartIndex),
          melody.isTiedToNext(measureStartIndex + lastLocalIndex),
        ),
      );

      runningTotal = ZERO;
      buffer.length = 0;
      measureStartIndex = i + 1;
    }
  }

  if (buffer.length > 0) {
    throw new IncompleteMeasureError(
      measureStartIndex,
      runningTotal,
      measureLength.difference(runningTotal),
    );
  }

  return measures;
}
