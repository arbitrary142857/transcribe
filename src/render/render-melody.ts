import {
  Accidental,
  BarlineType,
  Beam,
  Dot,
  Factory,
  type StaveNote,
} from "vexflow";

import { splitIntoMeasures, type Measure } from "../music/measure.js";
import type { Melody } from "../music/melody.js";
import { Note, Rest, type NoteEvent } from "../music/note-event.js";
import { ACCIDENTAL_STRING, type Pitch } from "../music/pitch.js";

const REST_KEY_BY_CLEF: Record<string, string> = {
  treble: "b/4",
  bass: "d/3",
};

export type RenderMelodyOptions = {
  elementId?: string;
  startX?: number;
  startY?: number;
  firstWidth?: number;
  barWidth?: number;
  staveHeight?: number;
  /** VexFlow clef name; defaults to `"treble"`. */
  clef?: string;
};

function pitchToVexKey(pitch: Pitch): string {
  return `${pitch.letter.toLowerCase()}${ACCIDENTAL_STRING[pitch.accidental]}/${pitch.octave}`;
}

/** Attach a rhythmic/visual dot (VexFlow Tutorial Step 3). */
function dotted(staveNote: StaveNote): StaveNote {
  Dot.buildAndAttach([staveNote], { all: true });
  return staveNote;
}

function eventToStaveNote(
  factory: Factory,
  event: NoteEvent,
  clef: string,
): StaveNote {
  const code = event.duration.vexFlowToken();
  const dots = event.duration.dots;

  if (event instanceof Rest) {
    const note = factory.StaveNote({
      keys: [REST_KEY_BY_CLEF[clef] ?? REST_KEY_BY_CLEF.treble!],
      duration: code,
      type: "r",
      dots,
      clef,
    });
    return dots > 0 ? dotted(note) : note;
  }

  if (event instanceof Note) {
    // VexFlow 5: `autoStem` + `clef` choose stem direction from staff position
    // (wiki Stem Direction; v5 renamed the old `auto_stem` field).
    const note = factory.StaveNote({
      keys: [pitchToVexKey(event.pitch)],
      duration: code,
      dots,
      clef,
      autoStem: true,
    });
    return dots > 0 ? dotted(note) : note;
  }

  throw new TypeError("Unknown NoteEvent type");
}

/**
 * Render a Melody into a DOM element using VexFlow's Factory API.
 * One System/Stave per measure on a single line.
 */
export function renderMelody(
  melody: Melody,
  options: RenderMelodyOptions = {},
): void {
  const {
    elementId = "output",
    startX = 10,
    startY = 20,
    firstWidth = 260,
    barWidth = 200,
    staveHeight = 140,
    clef = "treble",
  } = options;

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`No element with id "${elementId}"`);
  }
  element.replaceChildren();

  const measures = splitIntoMeasures(melody);
  if (measures.length === 0) {
    return;
  }

  const width =
    startX + firstWidth + Math.max(0, measures.length - 1) * barWidth + 20;
  const height = startY + staveHeight;

  const pageBg =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--page-bg")
      .trim() || "#f7f5f1";

  const factory = new Factory({
    renderer: { elementId, width, height, background: pageBg },
  });

  const keySpec = melody.keySignature.toString();
  const timeSpec = `${melody.timeSignature.beats}/${melody.timeSignature.beatUnit}`;
  const beamGroups = Beam.getDefaultBeamGroups(timeSpec);
  const beams: Beam[] = [];

  /**
   * One measure per System/Stave, juxtaposed (Wiki Tutorial Step 7).
   * Returns the measure's notes so ties can reference them.
   */
  function addMeasure({
    x,
    y,
    width: measureWidth,
    notes,
    clef,
    key,
    time,
    endBar,
  }: {
    x: number;
    y: number;
    width: number;
    notes: StaveNote[];
    clef?: string;
    key?: string;
    time?: string;
    endBar?: number;
  }): StaveNote[] {
    const system = factory.System({ x, y, width: measureWidth });
    const voice = factory.Voice({ time: timeSpec }).addTickables(notes);
    Accidental.applyAccidentals([voice], keySpec);

    const stave = system.addStave({
      voices: [voice],
      options: { leftBar: Boolean(clef || key || time) },
    });
    if (clef) stave.addClef(clef);
    if (key) stave.addKeySignature(key);
    if (time) stave.addTimeSignature(time);
    if (endBar !== undefined) stave.setEndBarType(endBar);

    return notes;
  }

  let previousNotes: StaveNote[] | undefined;
  let previousMeasure: Measure | undefined;

  for (let i = 0; i < measures.length; i++) {
    const measure = measures[i]!;
    const x = startX + (i === 0 ? 0 : firstWidth + (i - 1) * barWidth);
    const widthForBar = i === 0 ? firstWidth : barWidth;
    const isFirst = i === 0;
    const isLast = i === measures.length - 1;

    const notes = measure.events.map((event) =>
      eventToStaveNote(factory, event, clef),
    );

    // Tuplets before beaming and before the Voice is built: the Tuplet
    // constructor rewrites note tick counts, so the beat grouping below sees
    // each note's sounding length rather than its written one.
    const brackets = measure.tuplets.map(({ start, count, tuplet }) => {
      const groupNotes = notes.slice(start, start + count);
      return {
        bracket: factory.Tuplet({
          notes: groupNotes,
          options: {
            numNotes: tuplet.numNotes,
            notesOccupied: tuplet.inTimeOf,
          },
        }),
        notes: groupNotes,
      };
    });

    // Auto-beam by beat groups for this time signature (Wiki Automatic Beaming).
    beams.push(...Beam.generateBeams(notes, { groups: beamGroups }));

    // VexFlow chooses `bracketed` when the Tuplet is constructed, but no note is
    // beamed yet at that point. Re-apply its rule — bracket unless every note in
    // the group is beamed — now that the beams exist.
    for (const { bracket, notes: groupNotes } of brackets) {
      bracket.setBracketed(groupNotes.some((note) => !note.hasBeam()));
    }

    addMeasure({
      x,
      y: startY,
      width: widthForBar,
      notes,
      clef: isFirst ? clef : undefined,
      key: isFirst ? keySpec : undefined,
      time: isFirst ? timeSpec : undefined,
      endBar: isLast ? BarlineType.END : undefined,
    });

    // Within-measure ties
    for (const localIndex of measure.tiedToNext) {
      const from = notes[localIndex];
      const to = notes[localIndex + 1];
      if (!from || !to) {
        throw new Error(
          `Invalid within-measure tie at local index ${localIndex} in measure ${i}`,
        );
      }
      factory.StaveTie({
        from,
        to,
        firstIndexes: [0],
        lastIndexes: [0],
      });
    }

    // Cross-barline tie: after measure N+1 is rendered, if it is tied to previous
    if (measure.tiedToPrevBar) {
      if (!previousMeasure || !previousNotes) {
        throw new Error(
          `Measure ${i} is tied to previous bar, but no previous measure exists`,
        );
      }
      if (!previousMeasure.tiedToNextBar) {
        throw new Error(
          `Measure ${i} has tiedToPrevBar, but measure ${i - 1} lacks tiedToNextBar`,
        );
      }
      const from = previousNotes[previousNotes.length - 1];
      const to = notes[0];
      if (!from || !to) {
        throw new Error(`Missing notes for cross-barline tie at measure ${i}`);
      }
      factory.StaveTie({
        from,
        to,
        firstIndexes: [0],
        lastIndexes: [0],
      });
    }

    previousNotes = notes;
    previousMeasure = measure;
  }

  factory.draw();

  // Beams from generateBeams are not in Factory's render queue; draw after layout.
  const context = factory.getContext();
  for (const beam of beams) {
    beam.setContext(context).draw();
  }
}
