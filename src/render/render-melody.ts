import {
  Accidental,
  BarlineType,
  Beam,
  Dot,
  type ElementStyle,
  Factory,
  Formatter,
  type Stave,
  type StaveNote,
  type StaveTie,
  Stem,
} from "vexflow";

import { splitIntoMeasures } from "../music/measure.js";
import type { Melody } from "../music/melody.js";
import { Rest, UnpitchedNote, type NoteEvent } from "../music/note-event.js";
import { alterationInEffect, spellingContext } from "../music/spelling.js";
// `Accidental` here is VexFlow's modifier class, so the music module's own
// notion — how many semitones a letter is bent by — comes in under its other
// name.
import type { Accidental as Alteration } from "../music/types.js";
import { planBeams } from "./beaming.js";
import {
  chooseLines,
  lineRequirement as requirementOf,
  settledWeights,
} from "./line-breaks.js";
import { middleLinePitchOf, vexFlowKeyFor } from "./vex-key.js";

/** Room to the right of the last bar so a hanging tie is not clipped. */
const TAIL_SLACK = 24;

/**
 * How large the printed score comes out, as a fraction of full size.
 *
 * The layout is worked at the container's width divided by this and then
 * CSS-scaled back down to fit, so everything — staff, notes, spacing — lands
 * proportionally smaller: more bars share a line and more lines share the
 * window. Clicks are unaffected, mapped back through the svg's own screen
 * transform; what the shrink does cost the hit targets is paid back by
 * `HIT_PADDING` below, which is in svg units and so grew relatively anyway.
 */
const SCORE_SCALE = 0.82;

/** Grow each note's clickable area so thin stems stay easy to hit. */
const HIT_PADDING = 4;

/** Half a notehead's height; note bounds report head centres, not edges. */
const NOTEHEAD_RADIUS = 6;

/** Breathing room above and below a line, so a marker down it is not a tight collar. */
const LINE_MARGIN = 6;

/**
 * Room to reserve at the head of each line for the clef, the key signature's
 * accidentals, and the meter. VexFlow only reports these once a stave exists,
 * which is after the width has to be decided, so they are allowed for here.
 */
const CLEF_WIDTH = 46;
const KEY_ACCIDENTAL_WIDTH = 12;
const TIME_SIGNATURE_WIDTH = 30;

/**
 * The most bars that may share a line, however little they hold.
 *
 * Not a target — how many actually go on a line is settled by what they need
 * and what the page has — but a ceiling, so that a piece of near-empty bars
 * does not come out as one long thin strip of them.
 */
const MAX_BARS_PER_LINE = 6;

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
  /**
   * Melody indices that are not music yet — the trailing rests waiting past the
   * last note. Drawn faintly, so the page shows where writing has reached.
   */
  ghost?: ReadonlySet<number>;
  /**
   * Melody indices a puzzle has marked right, and marked wrong.
   *
   * Both are empty everywhere but the play page: the editor has nothing to be
   * right or wrong about. A tied run is one sound and gets one verdict, so the
   * caller puts every index of the run in the set rather than only its head —
   * the same thing the tie-colouring rule below is checking for.
   */
  correct?: ReadonlySet<number>;
  wrong?: ReadonlySet<number>;
};

/** A note's clickable area: its notehead and stem, padded. */
export type NoteHitRegion = {
  melodyIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Where one event was drawn: which line of music, and how far along it.
 *
 * `x` is the middle of the notehead, for anything that sits *on* the note.
 * `left` and `right` are the whole of what was drawn for it — accidentals,
 * stem and flag included — which is what anything standing *between* two
 * notes has to clear. The two are different questions and the answers differ
 * by more than a notehead: an accidental reaches well left of the head it
 * belongs to.
 */
export type EventAnchor = {
  readonly line: number;
  readonly x: number;
  readonly left: number;
  readonly right: number;
};

/**
 * How tall one line of music stands, in the svg's own coordinates.
 *
 * Taken from the staff and everything hanging off it rather than from the five
 * lines alone, so a marker drawn down a line covers its ledger notes too.
 */
export type ScoreLineBox = {
  readonly top: number;
  readonly bottom: number;
  /**
   * The five lines alone, before any of that opening out.
   *
   * What a marker drawn *to the staff* rather than to the notes wants: a
   * bracket down one line and the next should be the same height, and a bar
   * holding a high note is no reason for it to grow.
   */
  readonly staffTop: number;
  readonly staffBottom: number;
  /** Where notes may stand: after the clef and meter, before the last barline. */
  readonly left: number;
  readonly right: number;
};

export type MelodyRenderResult = {
  svg: SVGSVGElement;
  /** Indexed by melody event index; rests included, so indices line up. */
  notes: readonly StaveNote[];
  /**
   * Where each event can be clicked, rests included — a rest is the room the
   * next note is written into, and so the thing aimed at most often.
   */
  regions: readonly NoteHitRegion[];
  /** Indexed by melody event index, like `notes`. */
  anchors: readonly EventAnchor[];
  /** One per line of music, top to bottom. */
  lines: readonly ScoreLineBox[];
};

/** Attach a rhythmic/visual dot (VexFlow Tutorial Step 3). */
function dotted(staveNote: StaveNote): StaveNote {
  Dot.buildAndAttach([staveNote], { all: true });
  return staveNote;
}

function eventToStaveNote(
  factory: Factory,
  event: NoteEvent,
  clef: string,
  alteration: Alteration,
): StaveNote {
  const code = event.duration.vexFlowToken();
  const dots = event.duration.dots;
  const keys = [vexFlowKeyFor(event, clef, alteration)];

  // A note awaiting a pitch is stemmed and beamed like any other note — only
  // its notehead differs — so it reads as rhythm rather than as silence.
  const note =
    event instanceof Rest
      ? factory.StaveNote({ keys, duration: code, type: "r", dots, clef })
      : // VexFlow 5: `autoStem` + `clef` choose stem direction from staff
        // position (wiki Stem Direction; v5 renamed the old `auto_stem` field).
        factory.StaveNote({ keys, duration: code, dots, clef, autoStem: true });

  return dots > 0 ? dotted(note) : note;
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
    ghost = new Set<number>(),
    correct = new Set<number>(),
    wrong = new Set<number>(),
  } = options;

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`No element with id "${elementId}"`);
  }
  // Measure the space available before the old score is cleared out of it.
  // Laid out wider than the container by the scale's inverse, then CSS-shrunk
  // to fit — which is what draws the score at SCORE_SCALE of full size. A
  // width the caller passes explicitly is taken as the layout width it asks
  // for, exactly as before.
  const availableWidth =
    options.availableWidth ?? element.clientWidth / SCORE_SCALE;
  element.replaceChildren();

  const measures = splitIntoMeasures(melody);
  if (measures.length === 0) {
    throw new Error("Cannot render a melody with no measures");
  }

  const keySpec = melody.keySignature.toString();
  const timeSpec = `${melody.timeSignature.beats}/${melody.timeSignature.beatUnit}`;
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
    // A note awaiting a pitch has to be spelled with whatever the key and the
    // bar so far already do to the middle line, or VexFlow reads its bare letter
    // as a claim that the note is natural. The bar's own accidentals are what
    // `spellingContext` collects, and accidentals do not cross a barline, so the
    // context is built afresh from each measure's earlier events.
    const middleLine = middleLinePitchOf(clef);
    const measureNotes = measure.events.map((event, index) =>
      eventToStaveNote(
        factory,
        event,
        clef,
        event instanceof UnpitchedNote
          ? alterationInEffect(
              spellingContext(
                melody.keySignature,
                measure.events.slice(0, index),
              ),
              middleLine.letter,
              middleLine.octave,
            )
          : 0,
      ),
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

    // Grouped by `planBeams` rather than by `Beam.generateBeams`, which loses
    // its place in the bar the moment a note straddles a beat — see the note at
    // the top of `beaming.ts`. `autoStem` is what `generateBeams` did for a
    // group of its own: one direction, taken from where the group sits on the
    // staff, applied to every note in it.
    for (const plan of planBeams(measure, melody.timeSignature)) {
      const beam = new Beam(
        plan.notes.map((index) => measureNotes[index]!),
        true,
      );
      if (plan.secondaryBreaks.length > 0) {
        beam.breakSecondaryAt(plan.secondaryBreaks);
      }
      beams.push(beam);
    }

    // VexFlow chooses `bracketed` when the Tuplet is constructed, but no note is
    // beamed yet at that point. Re-apply its rule — bracket unless every note in
    // the group is beamed — now that the beams exist. The bracket also has to be
    // put on the side the stems went, which `generateBeams` used to do and which
    // now belongs here with everything else beaming decides.
    for (const { bracket, notes: groupNotes } of brackets) {
      bracket.setBracketed(groupNotes.some((note) => !note.hasBeam()));
      bracket.setTupletLocation(
        groupNotes[0]!.getStemDirection() === Stem.DOWN ? -1 : 1,
      );
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

  // Every line restates the clef and key; only the first states the meter.
  const accidentalCount = Math.abs(melody.keySignature.fifths());
  const leadWidth = (lineIndex: number) =>
    CLEF_WIDTH +
    KEY_ACCIDENTAL_WIDTH * accidentalCount +
    (lineIndex === 0 ? TIME_SIGNATURE_WIDTH : 0);

  // Where the music wraps. Settled from what each bar's contents actually need
  // — which the formatter has already told us, above — rather than from a
  // count fixed in advance. A caller that has its own opinion still gets it.
  const lines: number[][] = [];
  if (options.lineBreakAfter) {
    const breaks = options.lineBreakAfter;
    lines.push([]);
    for (let i = 0; i < measures.length; i++) {
      lines[lines.length - 1]!.push(i);
      if (breaks.has(i) && i < measures.length - 1) {
        lines.push([]);
      }
    }
  } else {
    let at = 0;
    for (const take of chooseLines(
      built.map((bar) => bar.minWidth),
      {
        usable: availableWidth - startX - TAIL_SLACK,
        firstLead: leadWidth(0),
        otherLead: leadWidth(1),
        maxPerLine: MAX_BARS_PER_LINE,
      },
    )) {
      lines.push(Array.from({ length: take }, (_, k) => at + k));
      at += take;
    }
  }

  // The same arithmetic the breaks were chosen by, so what a line was promised
  // when it was measured is what it is actually given when it is drawn.
  const minsOf = (lineIndex: number) =>
    lines[lineIndex]!.map((i) => built[i]!.minWidth);
  const weightsOf = (lineIndex: number) => settledWeights(minsOf(lineIndex));
  const lineRequirement = (lineIndex: number) =>
    requirementOf(minsOf(lineIndex), leadWidth(lineIndex));

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

  // Kept per line rather than per bar: what is wanted later is how tall a line
  // of music stands, and every bar on a line shares that.
  const staveOfLine: Stave[] = [];
  /**
   * And the last bar of each line, which is a different stave entirely.
   *
   * A line of music is one stave per bar, so the first of them knows where the
   * line's notes begin and only the last knows where they end. Asking the
   * first for both put the closing bracket at the end of bar one.
   */
  const endStaveOfLine: Stave[] = [];

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
      staveOfLine.push(stave);
    }
    endStaveOfLine[staveOfLine.length - 1] = stave;
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
  const placeholderStyle = asStyle(cssColor("--note-placeholder", "#9a9086"));
  const ghostStyle = asStyle(cssColor("--note-ghost", "#cfc8bd"));
  const correctStyle = asStyle(cssColor("--note-correct", "#1c7f3c"));
  const wrongStyle = asStyle(cssColor("--note-wrong", "#b8770a"));

  /**
   * What a note's colour says.
   *
   * Only what the note *is* — found, not found, waiting for a pitch, not music
   * yet. Where the pointer and the selection are is said by the halo instead,
   * drawn behind the note by `drawHalos` below.
   *
   * Those two used to be here, at the top of this list, which meant selecting
   * a note hid whatever its colour was saying: an amber note went rust the
   * moment you clicked it, exactly when you most wanted to know it was amber.
   * Splitting the two channels is what lets a note be wrong and selected at
   * once, and it is the reason the halo exists rather than merely being
   * prettier than a recolour.
   *
   * Wrong is checked before found only for tidiness; no index is ever in both.
   */
  const styleOf = (index: number): ElementStyle | undefined => {
    if (wrong.has(index)) return wrongStyle;
    if (correct.has(index)) return correctStyle;
    if (melody.getEvent(index) instanceof UnpitchedNote) {
      return placeholderStyle;
    }
    if (ghost.has(index)) return ghostStyle;
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

  // Built with `new Beam` rather than through the factory, so they are not in
  // its render queue; drawn here, after layout. Drawn plainly, so they never
  // take a selected note's colour.
  const context = factory.getContext();
  for (const beam of beams) {
    beam.setContext(context).draw();
  }

  // Positions are only final once everything is formatted and drawn.
  //
  // Every event gets a region, rests included: a rest is the room the next note
  // is written into, so it is the thing the user aims at most often.
  const regions: NoteHitRegion[] = [];
  for (let i = 0; i < notes.length; i++) {
    const region = hitRegion(notes[i]!);
    if (region) {
      regions.push({ melodyIndex: i, ...region });
    }
  }

  // Where each event ended up, for anything drawn over the score. The x is the
  // middle of the notehead rather than its left edge, so a marker put here sits
  // on the note rather than beside it.
  //
  // The width beside it is the opposite measurement, and taken the opposite
  // way. `getBoundingBox()` is avoided by `hitRegion` above precisely because
  // it swallows accidentals and ledger lines — which is exactly what is wanted
  // here, where the question is not "what did you aim at" but "what must I not
  // be drawn through". It merges the noteheads, the stem, the flag and every
  // modifier; a box that comes back empty — no canvas to measure a glyph on
  // yet — falls back to the noteheads, which are never absent.
  const anchors: EventAnchor[] = notes.map((note, i) => {
    const headLeft = note.getNoteHeadBeginX();
    const headRight = note.getNoteHeadEndX();
    const box = note.getBoundingBox();
    const drawn = box.getW() > 0;
    return {
      line: lineOfEvent[i] ?? 0,
      x: (headLeft + headRight) / 2,
      left: drawn ? Math.min(headLeft, box.getX()) : headLeft,
      right: drawn ? Math.max(headRight, box.getX() + box.getW()) : headRight,
    };
  });

  // Each line's height: the staff, opened out to take in whatever its notes
  // reach to. Ledger lines and long stems are what make this worth measuring
  // rather than assuming — a bar with a high note is taller than an empty one.
  const lineBoxes: ScoreLineBox[] = staveOfLine.map((stave, line) => {
    const staffTop = stave.getYForLine(0);
    const staffBottom = stave.getYForLine(4);
    let top = staffTop;
    let bottom = staffBottom;
    for (const region of regions) {
      if (lineOfEvent[region.melodyIndex] !== line) continue;
      top = Math.min(top, region.y);
      bottom = Math.max(bottom, region.y + region.h);
    }
    return {
      top: top - LINE_MARGIN,
      bottom: bottom + LINE_MARGIN,
      staffTop,
      staffBottom,
      // Both settle the stave's format if it has not been settled, so they are
      // safe to ask for here and only here — after everything is drawn. The
      // right edge comes off the line's *last* bar; `stave` is only its first.
      left: stave.getNoteStartX(),
      right: (endStaveOfLine[line] ?? stave).getNoteEndX(),
    };
  });

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

  drawHalos(svg, regions, selected, hovered);

  return { svg, notes, regions, anchors, lines: lineBoxes };
}

/** How far the halo stands off the note's own bounds, in svg units. */
const HALO_PADDING = 3;
const HALO_RADIUS = 5;

/**
 * Draw the halo behind the selected note, and a fainter one under the pointer.
 *
 * Behind, literally: these go in as the svg's first children, so the glyph is
 * drawn over them and nothing is obscured. That is also why this runs after
 * `factory.draw()` — the geometry it needs is only final once the score has
 * been laid out, and it is the same geometry `hitRegion` already worked out
 * for click targets, so the halo covers exactly what a click would hit.
 *
 * Selection wins where a note is both: pointing at the note you already have
 * selected should leave it looking as it did.
 *
 * A shape rather than a recolour, so that the note's own colour is left free
 * to mean something else. See `styleOf`.
 */
function drawHalos(
  svg: SVGSVGElement,
  regions: readonly NoteHitRegion[],
  selected: ReadonlySet<number>,
  hovered: ReadonlySet<number>,
): void {
  const halos: SVGRectElement[] = [];

  for (const region of regions) {
    const isSelected = selected.has(region.melodyIndex);
    if (!isSelected && !hovered.has(region.melodyIndex)) continue;

    const halo = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    halo.setAttribute("x", String(region.x - HALO_PADDING));
    halo.setAttribute("y", String(region.y - HALO_PADDING));
    halo.setAttribute("width", String(region.w + HALO_PADDING * 2));
    halo.setAttribute("height", String(region.h + HALO_PADDING * 2));
    halo.setAttribute("rx", String(HALO_RADIUS));
    // Classed rather than styled, so the colours live in the stylesheet with
    // every other colour on the page.
    halo.setAttribute("class", isSelected ? "note-halo" : "note-halo-hover");
    halos.push(halo);
  }

  if (halos.length > 0) {
    svg.prepend(...halos);
  }
}

/**
 * The union of an event's glyph and stem, padded, in svg user space.
 *
 * A note is built from its own geometry accessors rather than from
 * `getBoundingBox()`: that one swallows accidentals and ledger lines, which are
 * not things anybody aims at. A rest is the other way round — see below.
 */
function hitRegion(
  note: StaveNote,
): { x: number; y: number; w: number; h: number } | undefined {
  // A rest is asked for its own bounding box, which for a rest alone is exact.
  //
  // `getNoteHeadBounds` reports the one staff position a rest hangs at, so
  // padding that by a notehead's radius described a box about a fifth of a
  // quarter rest's height — too small to click. Measuring the drawn svg group
  // instead was worse in the other direction: the group carries the rest's
  // hidden stem, and `getBBox` on an svg `<text>` returns the font's em box
  // rather than its ink, which for a SMuFL face is most of a staff whatever
  // glyph is set in it.
  //
  // VexFlow's own box has neither problem. It measures glyphs through
  // `actualBoundingBoxAscent`/`Descent` — real ink — and it already leaves out
  // both of the things that would spoil this: `getBoundingBox` skips the stem
  // when `isRest()`, and `hasFlag()` is false for a rest. What is left is the
  // glyph and its augmentation dots, which is the thing on the page.
  //
  // Only rests. A note's box would swallow its accidentals and ledger lines,
  // which is exactly what the geometry below is written to leave out.
  if (note.isRest()) {
    const box = note.getBoundingBox();
    if (box.getW() > 0 && box.getH() > 0) {
      return {
        x: box.getX() - HIT_PADDING,
        y: box.getY() - HIT_PADDING,
        w: box.getW() + 2 * HIT_PADDING,
        h: box.getH() + 2 * HIT_PADDING,
      };
    }
    // Nothing measurable yet — no canvas to measure text on — so fall through
    // to the staff-position box, which is small but never absent.
  }

  // These are the centres of the outermost noteheads, not their edges.
  const { yTop, yBottom } = note.getNoteHeadBounds();
  if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) {
    return undefined;
  }

  let left = note.getNoteHeadBeginX();
  let right = note.getNoteHeadEndX();
  let top = yTop - NOTEHEAD_RADIUS;
  let bottom = yBottom + NOTEHEAD_RADIUS;

  // A rest carries a stem object too, hidden rather than absent, and taking its
  // extents would stretch the target far past the glyph the user can see.
  // VexFlow guards its own geometry the same way.
  const stem = !note.isRest() && note.hasStem() ? note.getStem() : undefined;
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
