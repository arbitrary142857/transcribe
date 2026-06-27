import {
  Accidental,
  BarlineType,
  Beam,
  Dot,
  type ElementStyle,
  Factory,
  Formatter,
  type StaveNote,
  type StaveTie,
  Stem,
} from "vexflow";

import { splitIntoMeasures } from "../music/measure.js";
import type { Melody } from "../music/melody.js";
import { Note, Rest, type NoteEvent } from "../music/note-event.js";
import { ACCIDENTAL_STRING, type Pitch } from "../music/pitch.js";

const REST_KEY_BY_CLEF: Record<string, string> = {
  treble: "b/4",
  bass: "d/3",
};

/** Room to the right of the last bar so a hanging tie is not clipped. */
const TAIL_SLACK = 24;

/** Grow each note's clickable area so thin stems stay easy to hit. */
const HIT_PADDING = 3;

/** Half a notehead's height; note bounds report head centres, not edges. */
const NOTEHEAD_RADIUS = 6;

/**
 * Room to reserve at the head of each line for the clef, the key signature's
 * accidentals, and the meter. VexFlow only reports these once a stave exists,
 * which is after the width has to be decided, so they are allowed for here.
 */
const CLEF_WIDTH = 46;
const KEY_ACCIDENTAL_WIDTH = 12;
const TIME_SIGNATURE_WIDTH = 30;

/**
 * Padding over the formatter's bare minimum, which packs notes until they
 * almost touch. Only binds when the music is too wide for the page; given more
 * room the bars are justified out to fill it anyway.
 */
const BAR_BREATHING = 1.08;

/**
 * The least room a bar may get, as a fraction of an equal share of its line.
 * Without it a bar holding one whole note collapses to a sliver next to a bar
 * of seven quintuplet sixteenths, though both last exactly as long.
 */
const MIN_BAR_SHARE = 0.95;

/**
 * How many bars share a line, by the width available.
 *
 * A narrow window would otherwise cram four bars into a line and scale the
 * whole score down to fit, leaving the notes too small to read. Breaking more
 * often trades height, which the page can scroll, for width, which it cannot.
 *
 * Ordered widest first; the first row the width reaches wins, so the last row
 * needs a threshold of 0 to catch everything else. Add a row to introduce
 * another step.
 */
const LINE_BREAKPOINTS: readonly { minWidth: number; barsPerLine: number }[] = [
  { minWidth: 900, barsPerLine: 4 },
  { minWidth: 0, barsPerLine: 2 },
];

function barsPerLineFor(availableWidth: number): number {
  return (
    LINE_BREAKPOINTS.find((row) => availableWidth >= row.minWidth)
      ?.barsPerLine ?? 4
  );
}

/** Break after every `barsPerLine`-th measure, as measure indices. */
function breaksEvery(barsPerLine: number, measureCount: number): Set<number> {
  const breaks = new Set<number>();
  for (let i = barsPerLine - 1; i < measureCount; i += barsPerLine) {
    breaks.add(i);
  }
  return breaks;
}

/**
 * Repetitions used to settle that floor. It converges geometrically while
 * `MIN_BAR_SHARE` is below 1, so this is far more than it needs.
 */
const FLOOR_PASSES = 40;

export type RenderMelodyOptions = {
  elementId?: string;
  startX?: number;
  startY?: number;
  staveHeight?: number;
  /**
   * Width to lay the score out into. Bars share it in proportion to how much
   * room their contents need, and it is raised to the widest line's minimum if
   * it is too small to hold one. Defaults to the container's own width.
   */
  availableWidth?: number;
  /** VexFlow clef name; defaults to `"treble"`. */
  clef?: string;
  /**
   * Measure indices after which the score wraps onto a new line. Left unset,
   * the bars-per-line is chosen from the width available.
   */
  lineBreakAfter?: ReadonlySet<number>;
  /** Melody indices to draw in the selected colour. */
  selected?: ReadonlySet<number>;
  /** Melody indices to draw in the hover colour; selection wins over hover. */
  hovered?: ReadonlySet<number>;
};

/** A note's clickable area: its notehead and stem, padded. */
export type NoteHitRegion = {
  melodyIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type MelodyRenderResult = {
  svg: SVGSVGElement;
  /** Indexed by melody event index; rests included, so indices line up. */
  notes: readonly StaveNote[];
  /** Notes only — rests have no region and so are inert to clicks. */
  regions: readonly NoteHitRegion[];
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
 * Colour a note and everything hanging off it.
 *
 * Noteheads and stems are children of the StaveNote, so `setStyle` reaches them
 * on its own. Flags and ledger lines take their own setters, and accidentals
 * and dots are modifiers rather than children, so they are styled one by one.
 * Beams are deliberately left out: they belong to no single note, and colouring
 * one would imply its neighbour is selected too.
 */
function applyNoteStyle(note: StaveNote, style: ElementStyle): void {
  note.setStyle(style);
  note.setFlagStyle(style);
  note.setLedgerLineStyle(style);
  for (const modifier of note.getModifiers()) {
    modifier.setStyle(style);
  }
}

function cssColor(variable: string, fallback: string): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(variable)
      .trim() || fallback
  );
}

const asStyle = (color: string): ElementStyle => ({
  fillStyle: color,
  strokeStyle: color,
});

/**
 * Render a Melody into a DOM element using VexFlow's Factory API: one Stave per
 * measure, wrapping onto a new line at each `lineBreakAfter` index.
 */
export function renderMelody(
  melody: Melody,
  options: RenderMelodyOptions = {},
): MelodyRenderResult {
  const {
    elementId = "output",
    startX = 10,
    startY = 20,
    staveHeight = 140,
    clef = "treble",
    selected = new Set<number>(),
    hovered = new Set<number>(),
  } = options;

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`No element with id "${elementId}"`);
  }
  // Measure the space available before the old score is cleared out of it.
  const availableWidth = options.availableWidth ?? element.clientWidth;
  element.replaceChildren();

  const measures = splitIntoMeasures(melody);
  if (measures.length === 0) {
    throw new Error("Cannot render a melody with no measures");
  }

  const keySpec = melody.keySignature.toString();
  const timeSpec = `${melody.timeSignature.beats}/${melody.timeSignature.beatUnit}`;
  const beamGroups = Beam.getDefaultBeamGroups(timeSpec);
  const beams: Beam[] = [];

  /** Indexed by melody event index, so ties never need local/global mapping. */
  const notes: StaveNote[] = [];
  /** Which line each event was drawn on, for splitting ties at a line break. */
  const lineOfEvent: number[] = [];

  // Notes have to exist before they can be measured, and they need a context to
  // exist in — so start on a provisional canvas and resize it once the widths
  // are known.
  const factory = new Factory({
    renderer: { elementId, width: 100, height: 100, background: "transparent" },
  });

  // Pass 1 — build each measure, and ask the formatter how much room its
  // contents actually need. Fixed bar widths cannot work: a bar of seven
  // quintuplet sixteenths needs far more room than a bar of two half notes, and
  // a bar given less than its minimum spills past its own barline.
  const built = measures.map((measure) => {
    const measureNotes = measure.events.map((event) =>
      eventToStaveNote(factory, event, clef),
    );

    // Tuplets before beaming and before the Voice is built: the Tuplet
    // constructor rewrites note tick counts, so the beat grouping below sees
    // each note's sounding length rather than its written one.
    const brackets = measure.tuplets.map(({ start, count, tuplet }) => {
      const groupNotes = measureNotes.slice(start, start + count);
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
    beams.push(...Beam.generateBeams(measureNotes, { groups: beamGroups }));

    // VexFlow chooses `bracketed` when the Tuplet is constructed, but no note is
    // beamed yet at that point. Re-apply its rule — bracket unless every note in
    // the group is beamed — now that the beams exist.
    for (const { bracket, notes: groupNotes } of brackets) {
      bracket.setBracketed(groupNotes.some((note) => !note.hasBeam()));
    }

    const voice = factory.Voice({ time: timeSpec }).addTickables(measureNotes);
    // Applied before measuring: an accidental widens the note it sits on.
    Accidental.applyAccidentals([voice], keySpec);

    const formatter = new Formatter();
    formatter.joinVoices([voice]);

    return {
      measure,
      notes: measureNotes,
      voice,
      minWidth: formatter.preCalculateMinTotalWidth([voice]),
    };
  });

  const breaks =
    options.lineBreakAfter ??
    breaksEvery(barsPerLineFor(availableWidth), measures.length);

  const lines: number[][] = [[]];
  for (let i = 0; i < measures.length; i++) {
    lines[lines.length - 1]!.push(i);
    if (breaks.has(i) && i < measures.length - 1) {
      lines.push([]);
    }
  }

  // Every line restates the clef and key; only the first states the meter.
  const accidentalCount = Math.abs(melody.keySignature.fifths());
  const leadWidth = (lineIndex: number) =>
    CLEF_WIDTH +
    KEY_ACCIDENTAL_WIDTH * accidentalCount +
    (lineIndex === 0 ? TIME_SIGNATURE_WIDTH : 0);

  // Every bar here lasts the same length of time, so they should come out close
  // to the same width, with content only stretching a bar that genuinely needs
  // the room. Weighting purely by content would leave a bar holding one whole
  // note a sliver beside a bar of seven quintuplet sixteenths.
  const weightsOf = (lineIndex: number) => {
    const mins = lines[lineIndex]!.map((i) => built[i]!.minWidth);
    // A floor rather than an average: a bar that already needs more than its
    // share keeps exactly the room its contents ask for, so propping up the
    // sparse bars never squeezes the crowded ones.
    //
    // The floor is a fraction of an equal share of the room actually handed
    // out, which depends on the floor — raising the thin bars raises the total,
    // which raises the floor again. Settle it by repetition rather than against
    // the raw minimums, where one crowded bar drags the whole line's share up
    // and leaves its sparse neighbours looking starved beside it.
    let weights = mins;
    for (let pass = 0; pass < FLOOR_PASSES; pass++) {
      const share = weights.reduce((total, w) => total + w, 0) / weights.length;
      weights = mins.map((m) => Math.max(m, MIN_BAR_SHARE * share));
    }
    return weights;
  };

  /**
   * The narrowest this line can be while every bar still holds its contents.
   * Solved from the share each bar is about to be given, so a bar that evening
   * out shrinks is still guaranteed at least its minimum.
   */
  const lineRequirement = (lineIndex: number) => {
    const weights = weightsOf(lineIndex);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const tightest = Math.max(
      ...lines[lineIndex]!.map(
        (i, position) => (built[i]!.minWidth * totalWeight) / weights[position]!,
      ),
    );
    return leadWidth(lineIndex) + tightest * BAR_BREATHING;
  };

  // Pass 2 — fill the width the page gives us, but never go below what the
  // hungriest line needs, so a narrow window scrolls rather than overlapping
  // notes. Every line is then justified to that same width.
  const contentWidth = Math.max(
    ...lines.map((_, lineIndex) => lineRequirement(lineIndex)),
    availableWidth - startX - TAIL_SLACK,
  );

  type Placement = { x: number; y: number; width: number; startsLine: boolean };
  const placements: Placement[] = [];
  lines.forEach((lineMeasures, lineIndex) => {
    const lead = leadWidth(lineIndex);
    const weights = weightsOf(lineIndex);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const share = (contentWidth - lead) / totalWeight;
    let x = startX;

    lineMeasures.forEach((i, positionInLine) => {
      const startsLine = positionInLine === 0;
      const width =
        weights[positionInLine]! * share + (startsLine ? lead : 0);
      placements[i] = {
        x,
        y: startY + lineIndex * staveHeight,
        width,
        startsLine,
      };
      x += width;

      for (let j = 0; j < built[i]!.notes.length; j++) {
        const globalIndex = built[i]!.measure.startIndex + j;
        notes[globalIndex] = built[i]!.notes[j]!;
        lineOfEvent[globalIndex] = lineIndex;
      }
    });
  });

  factory
    .getContext()
    .resize(
      startX + contentWidth + TAIL_SLACK,
      startY + lines.length * staveHeight,
    );

  for (let i = 0; i < measures.length; i++) {
    const placement = placements[i]!;
    const system = factory.System({
      x: placement.x,
      y: placement.y,
      width: placement.width,
    });
    const stave = system.addStave({
      voices: [built[i]!.voice],
      options: { leftBar: placement.startsLine },
    });
    if (placement.startsLine) {
      stave.addClef(clef);
      stave.addKeySignature(keySpec);
    }
    // The meter is stated once, at the top of the piece.
    if (i === 0) {
      stave.addTimeSignature(timeSpec);
    }
    if (i === measures.length - 1) {
      stave.setEndBarType(BarlineType.END);
    }
  }

  // One tie path for every tie in the melody. A barline is not a rendering
  // boundary, so a tie across one is drawn exactly like a tie inside a bar; only
  // a line break splits a tie, into a pair of partial ties that hang off the end
  // of one line and onto the start of the next.
  const ties: { tie: StaveTie; between: readonly [number, number] }[] = [];
  for (let i = 0; i < melody.eventCount - 1; i++) {
    if (!melody.isTiedToNext(i)) {
      continue;
    }
    const from = notes[i]!;
    const to = notes[i + 1]!;
    const between = [i, i + 1] as const;

    if (lineOfEvent[i] === lineOfEvent[i + 1]) {
      ties.push({
        between,
        tie: factory.StaveTie({
          from,
          to,
          firstIndexes: [0],
          lastIndexes: [0],
        }),
      });
      continue;
    }

    // Each half would otherwise take its direction from the one note it has, so
    // they could curve opposite ways. Pin both to what a whole tie would use.
    const direction = to.getStemDirection();
    for (const half of [{ from }, { to }]) {
      ties.push({
        between,
        tie: factory.StaveTie({
          ...half,
          firstIndexes: [0],
          lastIndexes: [0],
          options: { direction },
        }),
      });
    }
  }

  // Styling has to happen before draw(): Factory.draw() routes elements through
  // drawWithStyle(), which applies each element's own style to the context.
  const selectedStyle = asStyle(cssColor("--note-selected", "#b4432c"));
  const hoveredStyle = asStyle(cssColor("--note-hovered", "#c99a86"));

  // Selection wins over hover, so pointing at an already-selected note leaves
  // it looking exactly as it did.
  const styleOf = (index: number): ElementStyle | undefined => {
    if (selected.has(index)) return selectedStyle;
    if (hovered.has(index)) return hoveredStyle;
    return undefined;
  };

  for (let i = 0; i < notes.length; i++) {
    const style = styleOf(i);
    if (style) {
      applyNoteStyle(notes[i]!, style);
    }
  }

  // A tie is only coloured when the notes at both of its ends are, so a tie
  // never reaches out towards a note that is not part of the selection.
  for (const { tie, between } of ties) {
    const [from, to] = between;
    const style = styleOf(from);
    if (style && style === styleOf(to)) {
      tie.setStyle(style);
    }
  }

  factory.draw();

  // Beams from generateBeams are not in Factory's render queue; draw after
  // layout. Drawn plainly, so they never take a selected note's colour.
  const context = factory.getContext();
  for (const beam of beams) {
    beam.setContext(context).draw();
  }

  // Positions are only final once everything is formatted and drawn.
  const regions: NoteHitRegion[] = [];
  for (let i = 0; i < notes.length; i++) {
    if (!(melody.getEvent(i) instanceof Note)) {
      continue;
    }
    const region = hitRegion(notes[i]!);
    if (region) {
      regions.push({ melodyIndex: i, ...region });
    }
  }

  const svg = element.querySelector("svg");
  if (!svg) {
    throw new Error("VexFlow did not produce an svg element");
  }

  // `resize` above gave the svg a viewBox of the laid-out size, so letting CSS
  // set the width scales the whole score to whatever room there is. On a narrow
  // screen the music shrinks to fit rather than running off the side; it never
  // grows past its natural size, because the layout already takes at least the
  // width available. Hit regions stay correct without adjustment — they are in
  // the svg's own coordinates, and clicks are mapped back through its screen
  // transform, which accounts for the scaling.
  svg.style.width = "100%";
  svg.style.height = "auto";

  return { svg, notes, regions };
}

/**
 * The union of a note's noteheads and stem, padded, in svg user space.
 *
 * Built from the note's own geometry accessors rather than `getBoundingBox()`:
 * `Stem` declares that method but its implementation throws, and StaveNote's
 * own bounding box would swallow modifiers and ledger lines we do not want in
 * the click target.
 */
function hitRegion(
  note: StaveNote,
): { x: number; y: number; w: number; h: number } | undefined {
  // These are the centres of the outermost noteheads, not their edges.
  const { yTop, yBottom } = note.getNoteHeadBounds();
  if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) {
    return undefined;
  }

  let left = note.getNoteHeadBeginX();
  let right = note.getNoteHeadEndX();
  let top = yTop - NOTEHEAD_RADIUS;
  let bottom = yBottom + NOTEHEAD_RADIUS;

  const stem = note.getStem();
  if (stem) {
    const { topY, baseY } = stem.getExtents();
    const stemX = note.getStemX();
    left = Math.min(left, stemX - Stem.WIDTH);
    right = Math.max(right, stemX + Stem.WIDTH);
    top = Math.min(top, topY, baseY);
    bottom = Math.max(bottom, topY, baseY);
  }

  return {
    x: left - HIT_PADDING,
    y: top - HIT_PADDING,
    w: right - left + 2 * HIT_PADDING,
    h: bottom - top + 2 * HIT_PADDING,
  };
}
