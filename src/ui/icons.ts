/**
 * Small notation icons.
 *
 * The Unicode musical symbols are unusable at button size: their ink runs far
 * outside the em box, so a glyph sits high in its button with the stem
 * overflowing, and overflowing content stays clickable — one row of buttons
 * reaches into the next and takes its clicks. Simple shapes are drawn here
 * instead, inside a box that can be centred exactly. Where a shape is one the
 * eye knows too well to accept an approximation — a rest — the icon borrows the
 * real glyph from Bravura, which is loaded for the score anyway.
 */

const NS = "http://www.w3.org/2000/svg";

/** Every icon is 24 tall; only the width varies. */
const HEIGHT = 24;

function svg(paths: string, width = 24): string {
  return `<svg xmlns="${NS}" viewBox="0 0 ${width} ${HEIGHT}" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/** SMuFL glyphs, set in the score's own font. */
const SMUFL = { quarterNote: "\uE1D5", quarterRest: "\uE4E5" } as const;

const glyph = (character: string, x: number, y: number, size: number) =>
  `<text x="${x}" y="${y}" font-family="Bravura" font-size="${size}" fill="currentColor">${character}</text>`;

/** Strokes stay light: at this size a heavy line turns a note into a blob. */
const STROKE = 1.15;

/**
 * A notehead: an oval leaning the way a notehead leans.
 *
 * A filled head is filled and nothing else. Giving it a stroke as well grew it
 * by half the stroke on every side, which is what made these look swollen next
 * to the hollow ones.
 */
function head(cx: number, cy: number, filled: boolean): string {
  const shape = filled
    ? `rx="3.9" ry="2.7" fill="currentColor"`
    : `rx="3.6" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.25"`;
  return `<ellipse cx="${cx}" cy="${cy}" ${shape} transform="rotate(-20 ${cx} ${cy})" />`;
}

const stem = (x: number, top: number, bottom: number) =>
  `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" />`;

/**
 * How far apart stacked flags sit.
 *
 * A hook descends about seven units from where it springs, so anything much
 * under this and consecutive flags overlap by more than half their ink: at 2.7,
 * where this started, a sixteenth and a thirty-second were the same dark smear
 * and could not be told apart. Spread to roughly the hook's own depth they read
 * as separate hooks, which is the only way the count is legible at button size.
 *
 * A single flag is untouched by this, so an eighth note looks exactly as it did.
 */
const FLAG_PITCH = 4;

/**
 * Flags curl off the top of the stem, one per halving below an eighth.
 *
 * Kept high and tight: they have to stay clear of the augmentation dot, which
 * sits out to the right at notehead height, and three of them have to read as
 * three rather than as one thick smear against the stem.
 */
function flags(x: number, top: number, count: number): string {
  let drawn = "";
  for (let i = 0; i < count; i++) {
    const y = top + i * FLAG_PITCH;
    // A slender hook rather than a wedge: the outward curve and the return run
    // close together, so two of them stack without becoming one dark mass.
    drawn +=
      `<path d="M${x} ${y} c2.7 0.9 4.0 2.6 3.9 4.6 c-0.05 0.9 -0.45 1.7 -1.2 2.4 ` +
      `c0.45 -2.1 -0.55 -3.5 -2.4 -4.6 Z" fill="currentColor" />`;
  }
  return drawn;
}

const dot = (cx: number, cy: number) =>
  `<circle cx="${cx}" cy="${cy}" r="1.15" fill="currentColor" />`;

/**
 * A note of `value` with `dots` augmentation dots.
 *
 * `value` is the denominator of the note's share of a whole note, matching
 * `NoteValue`: 1 is a whole note, 4 a quarter, 16 a sixteenth.
 */
export function noteIcon(value: number, dots: number): string {
  const cx = 7.4;
  // Low in the box, so the flags have the top of a full-length stem to hang
  // from and still finish well above the dot.
  const cy = 18.3;
  const stemX = cx + 3.8;
  // High enough that a thirty-second's three flags all fit above the dot. The
  // box cannot grow to make room: the svg is drawn to a square cell, so a wider
  // view box would letterbox and this one icon would come out smaller than the
  // others in its row.
  const stemTop = 3.2;
  const flagged = value >= 8;
  const filled = value >= 4;

  let parts = head(cx, cy, filled);
  if (value > 1) {
    parts += stem(stemX, stemTop, cy - 0.5);
  }
  if (flagged) {
    parts += flags(stemX, stemTop, Math.log2(value) - 2);
  }
  // Right of the notehead and level with it, which is where a dot goes. A
  // flagged note pushes it further out, past where the flags reach: level with
  // the head it already clears them downwards, but a thirty-second's lowest
  // flag comes down far enough that the two would still overlap side to side,
  // and a dot touching a flag reads as a fourth flag.
  const dotX = value === 1 ? cx + 5.6 : stemX + (flagged ? 5.6 : 4);
  for (let i = 0; i < dots; i++) {
    parts += dot(dotX + i * 3.1, cy);
  }
  return svg(parts);
}

/** Turning a note into a rest of the same length: what it is, and what it becomes. */
export function restIcon(): string {
  return svg(
    glyph(SMUFL.quarterNote, 1, 19.5, 20) +
      arrow(19, 12, 30) +
      glyph(SMUFL.quarterRest, 33, 16.5, 20),
    46,
  );
}

/**
 * A plain arrow, pointing right.
 *
 * The head is a filled triangle rather than two strokes meeting at a point: an
 * open chevron this small comes out spindly and reads as a stray mark.
 */
function arrow(from: number, y: number, to: number): string {
  return (
    `<line x1="${from}" y1="${y}" x2="${to - 3.6}" y2="${y}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />` +
    `<path d="M${to} ${y} L${to - 4.4} ${y - 2.9} L${to - 4.4} ${y + 2.9} Z" fill="currentColor" />`
  );
}

/**
 * Two notes with a tie between them.
 *
 * Both notes are drawn whole — heads and stems — because the icon has to say
 * "these two notes", and the tie is the arc joining their heads. Stems up puts
 * the tie underneath, which is where it goes.
 */
export function tieIcon(): string {
  const left = 8;
  const right = 24;
  const cy = 9.5;
  // Stems down, which puts the tie above — and away from the noteheads. Sprung
  // from directly beneath them the curve merged into the heads at button size
  // and the pair stopped reading as two notes at all.
  return svg(
    `<path d="M${left - 1} ${cy - 4.6} Q${(left + right) / 2} ${cy - 9.2} ${right + 1} ${cy - 4.6}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />` +
      head(left, cy, true) +
      stem(left - 3.4, cy + 0.5, 21) +
      head(right, cy, true) +
      stem(right - 3.4, cy + 0.5, 21),
    32,
  );
}

/** The same two notes, with the tie broken open between them. */
export function untieIcon(): string {
  const left = 8;
  const right = 24;
  const cy = 9.5;
  const arc = (from: number, control: number, to: number) =>
    `<path d="M${from} ${cy - 4.6} Q${control} ${cy - 8.4} ${to} ${cy - 7.6}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />`;

  // Two stubs of a tie with a gap where the join would be: the tie is what is
  // being taken away, so what is missing has to be the visible part.
  return svg(
    arc(left - 1, left + 3, left + 6.5) +
      arc(right + 1, right - 3, right - 6.5) +
      head(left, cy, true) +
      stem(left - 3.4, cy + 0.5, 21) +
      head(right, cy, true) +
      stem(right - 3.4, cy + 0.5, 21),
    32,
  );
}

/** An X notehead on a stem: a note whose pitch is not chosen yet. */
export function unpitchedIcon(): string {
  return svg(
    `<path d="M5.4 13.8 L11.6 18.6 M11.6 13.8 L5.4 18.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />` +
      stem(12.1, 5.6, 17.4),
  );
}

/**
 * Five staff lines, the ground the playback icons stand on.
 *
 * Kept faint but not ghostly: these icons are also drawn in white on a filled
 * button, where anything lighter disappears into the fill.
 */
const STAFF_TOP = 10;
const STAFF_GAP = 3;
const STAFF_BOTTOM = STAFF_TOP + 4 * STAFF_GAP;

function staffLines(from: number, to: number): string {
  let drawn = "";
  for (let i = 0; i < 5; i++) {
    const y = STAFF_TOP + i * STAFF_GAP;
    drawn += `<line x1="${from}" y1="${y}" x2="${to}" y2="${y}" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.7" />`;
  }
  return drawn;
}

/**
 * A pointer coming down onto a spot, saying "this instant, here".
 *
 * Held clear of what it points at. Sat directly on the barline the two merged
 * into a single arrow, and the icon stopped being a staff with a mark on it.
 */
const pointer = (x: number) =>
  `<path d="M${x} ${STAFF_TOP - 1.6} L${x - 3.2} ${STAFF_TOP - 6} L${x + 3.2} ${STAFF_TOP - 6} Z" fill="currentColor" />`;

const barline = (x: number, width: number) =>
  `<line x1="${x}" y1="${STAFF_TOP}" x2="${x}" y2="${STAFF_BOTTOM}" stroke="currentColor" stroke-width="${width}" stroke-linecap="butt" />`;

/**
 * Marking where the first bar begins: a pointer onto the opening barline.
 *
 * The staff runs off to the right of it, because what is being marked is the
 * moment the music starts rather than a place in the middle of it.
 */
export function markStartIcon(): string {
  return svg(staffLines(5, 24) + barline(5.6, 2.6) + pointer(5.6), 28);
}

/**
 * Marking where the last bar ends: a pointer onto the final barline.
 *
 * Thin then thick, which is how the end of a piece is printed — so the icon says
 * "the end" before anything else about it is read.
 */
export function markEndIcon(): string {
  return svg(
    staffLines(4, 23.4) + barline(20.2, 0.9) + barline(22.8, 2.6) + pointer(22.4),
    28,
  );
}

/**
 * A metronome: the case, and the rod leaning out of it.
 *
 * The lean is the whole point — upright it would read as a tent — so the rod
 * runs off to one side with its weight partway up.
 */
export function metronomeIcon(): string {
  return svg(
    `<path d="M8.4 20.5 L11.6 4.5 L14.4 4.5 L17.6 20.5 Z" fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linejoin="round" />` +
      `<line x1="9.6" y1="14.5" x2="16.4" y2="14.5" stroke="currentColor" stroke-width="0.9" opacity="0.55" />` +
      `<line x1="13" y1="19" x2="16.6" y2="6.4" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" />` +
      `<rect x="14.1" y="10.4" width="4" height="2.2" rx="0.5" transform="rotate(-16 16.1 11.5)" fill="currentColor" />`,
  );
}

/**
 * The marker that follows the music, shown standing on a note.
 *
 * One note under the marker and one clear of it, which is what says the marker
 * moves. Solid enough to survive being drawn in white on a filled button, where
 * the faint version it started as vanished into the fill.
 */
export function playheadIcon(): string {
  return svg(
    staffLines(2.5, 21.5) +
      head(7.5, 13, true) +
      head(17, 16, true) +
      `<rect x="4.9" y="4.5" width="5.2" height="15" rx="1.3" fill="currentColor" opacity="0.5" />` +
      `<line x1="7.5" y1="4.5" x2="7.5" y2="19.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />`,
    24,
  );
}

/**
 * A padlock, closed: the tempo is held and edits move in step.
 *
 * The shackle sits proud of the body so the two read as lock parts rather than
 * as a rounded rectangle with a hat.
 */
export function lockClosedIcon(): string {
  return svg(
    `<rect x="6.5" y="11" width="11" height="8.5" rx="1.6" fill="currentColor" />` +
      `<path d="M8.8 11 V8.4 a3.2 3.2 0 0 1 6.4 0 V11" fill="none" stroke="currentColor" stroke-width="1.7" />`,
  );
}

/** The same padlock with its shackle swung open: the tempo follows the marks. */
export function lockOpenIcon(): string {
  return svg(
    `<rect x="6.5" y="11" width="11" height="8.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4" />` +
      `<path d="M8.8 11 V8.4 a3.2 3.2 0 0 1 6.35 -0.6" fill="none" stroke="currentColor" stroke-width="1.7" />`,
  );
}

export function playIcon(): string {
  return svg(`<path d="M8 5.5 L19 12 L8 18.5 Z" fill="currentColor" />`);
}

export function pauseIcon(): string {
  return svg(
    `<rect x="7" y="5.5" width="3.6" height="13" rx="0.9" fill="currentColor" />` +
      `<rect x="13.4" y="5.5" width="3.6" height="13" rx="0.9" fill="currentColor" />`,
  );
}

/** Back to the top of the section: the bar it stops at, and the way there. */
export function jumpBackIcon(): string {
  return svg(
    `<rect x="5.4" y="5.5" width="2.2" height="13" rx="0.7" fill="currentColor" />` +
      `<path d="M19 5.5 L9.5 12 L19 18.5 Z" fill="currentColor" />`,
  );
}

/**
 * A circle almost closed, with one arrowhead carrying it round: what reaches
 * the end starts again.
 */
export function loopIcon(): string {
  return svg(
    `<path d="M18.35 9.2 A7 7 0 1 0 19 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />` +
      `<path d="M19.9 4.3 L19.55 10.1 L14.4 8.1 Z" fill="currentColor" />`,
  );
}

/**
 * An arrow curling back on itself: put this back the way it started.
 *
 * The loop icon's mirror twin — anticlockwise where the loop runs clockwise —
 * so the two read as relatives, one that circles and one that returns.
 */
export function restoreIcon(): string {
  return svg(
    `<path d="M5.65 9.2 A7 7 0 1 1 5 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />` +
      `<path d="M4.1 4.3 L4.45 10.1 L9.6 8.1 Z" fill="currentColor" />`,
  );
}

/** The moment the selected note begins: a pointer onto its left edge. */
export function noteStartIcon(): string {
  return svg(
    staffLines(3, 24) +
      head(14, 16, true) +
      stem(17.8, 6.5, 15.5) +
      `<line x1="9.4" y1="8" x2="9.4" y2="20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />` +
      pointer(9.4),
    27,
  );
}

/** The moment the selected note ends: a pointer onto its right edge. */
export function noteEndIcon(): string {
  return svg(
    staffLines(3, 24) +
      head(9.5, 16, true) +
      stem(13.3, 6.5, 15.5) +
      `<line x1="17.8" y1="8" x2="17.8" y2="20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />` +
      pointer(17.8),
    27,
  );
}

/**
 * A tuplet bracket carrying its number, as it will be printed over the notes.
 *
 * The number alone says nothing about what the control does; the bracket is
 * what the user will see on the page once they press it.
 */
export function tupletIcon(numNotes: number): string {
  const line = 10.5;
  const tick = 17.5;
  const bracket = (from: number, to: number) =>
    `<path d="M${from} ${tick} L${from} ${line} L${to} ${line}" fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" />`;

  // The number sits in the break in the bracket, big enough to read at button
  // size — it is the part that says which tuplet this is.
  //
  // The number takes the page's own typeface through the same custom property
  // the stylesheet uses, so a change of font takes this with it rather than
  // leaving it behind — it used to name Georgia outright and would have.
  //
  // As a `style` rather than a `font-family` attribute: presentation attributes
  // do not resolve `var()`, and a declaration is the only place a custom
  // property means anything.
  return svg(
    bracket(2.5, 8) +
      bracket(21.5, 16) +
      `<text x="12" y="${line + 4.6}" text-anchor="middle" style="font-family: var(--font-ui)" font-size="13" font-style="italic" fill="currentColor">${numNotes}</text>`,
  );
}

/** A pencil, for opening a saved transcription to change it. */
export function pencilIcon(): string {
  return svg(
    // The nib, the body, and the band where the two meet — three shapes
    // rather than one outline, so the point stays sharp at button size.
    `<path d="M4 20 L4.9 16.4 L7.6 19.1 Z" fill="currentColor" />` +
      `<path d="M6.2 15.1 L15.1 6.2 L17.8 8.9 L8.9 17.8 Z" fill="none" ` +
      `stroke="currentColor" stroke-width="${STROKE * 1.4}" stroke-linejoin="round" />` +
      `<path d="M16.4 4.9 A1.9 1.9 0 0 1 19.1 7.6 L17.8 8.9 L15.1 6.2 Z" ` +
      `fill="currentColor" />`,
  );
}

/**
 * A waste basket, for throwing a level away.
 *
 * The lid is drawn as its own line with the handle above it, because a bin
 * outline alone at this size is a cup: the lid is the part that says what it is.
 */
export function trashIcon(): string {
  return svg(
    `<path d="M9.6 4.6 h4.8" fill="none" stroke="currentColor" stroke-width="${STROKE * 1.3}" stroke-linecap="round" />` +
      `<path d="M4.8 7.4 h14.4" fill="none" stroke="currentColor" stroke-width="${STROKE * 1.3}" stroke-linecap="round" />` +
      `<path d="M6.9 7.4 L7.9 19.6 a1 1 0 0 0 1 0.9 h6.2 a1 1 0 0 0 1 -0.9 L17.1 7.4" ` +
      `fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linejoin="round" />` +
      // Two ribs, so the body reads as a bin rather than as an empty outline.
      `<path d="M10.4 10.4 V17.4 M13.6 10.4 V17.4" fill="none" stroke="currentColor" ` +
      `stroke-width="0.95" stroke-linecap="round" opacity="0.65" />`,
  );
}

/**
 * A stretch of staff cut into bars, for "how many bars".
 *
 * Two staff lines rather than five: at this size five turn into a grey block,
 * and what the icon has to say is the barlines dividing them.
 */
export function barsIcon(): string {
  return svg(
    `<line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="0.9" opacity="0.5" />` +
      `<line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" stroke-width="0.9" opacity="0.5" />` +
      [2, 9, 16, 22]
        .map(
          (x) =>
            `<line x1="${x}" y1="7.5" x2="${x}" y2="16.5" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" />`,
        )
        .join(""),
  );
}

/** A clock, for how long the excerpt runs. */
export function lengthIcon(): string {
  return svg(
    `<circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="${STROKE}" />` +
      `<path d="M12 7.2 L12 12 L15.4 14.2" fill="none" stroke="currentColor" ` +
      `stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" />`,
  );
}

/**
 * The Phosphor glyphs: the chili pepper, the heart, and the solvers' check.
 *
 * The icons here that are not this site's own drawing. Every path below is
 * Phosphor Icons' (phosphoricons.com) -- `pepper` and `heart` in their
 * `regular` and `fill` weights, two weights of one silhouette each, which
 * is what lets a display lay the filled shape under the outlined one; and
 * `check-circle` regular for the solved-by figure, which stays legible at
 * figure size and cannot be read as the card's plain ✓ badge. Phosphor
 * Icons is MIT licensed, Copyright (c) 2023 Phosphor Icons; this notice is
 * the attribution the licence asks to travel with the paths. Their
 * viewBox, too (256, not 24); the CSS sizes them in ems.
 */
const PHOSPHOR_VIEW = `<svg xmlns="${NS}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">`;

/** The outline weight: the border of every pepper, always visible. */
export function pepperIcon(): string {
  return (
    PHOSPHOR_VIEW +
    `<path d="M167.27,40.42A40.06,40.06,0,0,0,128,8a8,8,0,0,0,0,16,24,24,0,0,1,22.85,16.66A64.08,64.08,0,0,0,96,104c0,46.75-25.75,78-76.53,93a16,16,0,0,0,1.77,31.13A264.8,264.8,0,0,0,66.75,232c40.78,0,86.16-9.15,117.53-35.46C210.64,174.44,224,143.3,224,104h0A64.07,64.07,0,0,0,167.27,40.42ZM160,56a48.07,48.07,0,0,1,45.37,32.37L192,95,163.58,80.83a8,8,0,0,0-7.16,0L128,95l-13.37-6.68A48.08,48.08,0,0,1,160,56Zm14,128.3c-18,15.07-43.6,25.26-74.12,29.47A254.08,254.08,0,0,1,24,212.37h0v0c57.23-16.87,87.63-54,88-107.42l12.44,6.22a8,8,0,0,0,7.16,0L160,96.93l28.42,14.21a8,8,0,0,0,7.16,0l12.41-6.2C207.78,138.84,196.35,165.54,174,184.29Z"/>` +
    `</svg>`
  );
}

/**
 * The fill weight: what a full pepper is filled with, and a half half.
 *
 * Phosphor's fill weight as shipped: the cap — the dome above the zigzag
 * calyx — stays a cut-out, by decision (a solid-cap variant was tried and
 * turned down; dropping the second subpath is what fills it).
 */
export function pepperFillIcon(): string {
  return (
    PHOSPHOR_VIEW +
    `<path d="M167.27,40.42A40.06,40.06,0,0,0,128,8a8,8,0,0,0,0,16,24,24,0,0,1,22.85,16.66A64.08,64.08,0,0,0,96,104c0,46.75-25.75,78-76.53,93a16,16,0,0,0,1.77,31.13A264.8,264.8,0,0,0,66.75,232c40.78,0,86.16-9.15,117.53-35.46C210.64,174.44,224,143.3,224,104h0A64.07,64.07,0,0,0,167.27,40.42ZM192,95,163.58,80.83a8,8,0,0,0-7.16,0L128,95l-13.37-6.68a48,48,0,0,1,90.74,0Z"/>` +
    `</svg>`
  );
}

/** The heart's outline: an upvote not yet given, and the figure's glyph. */
export function heartIcon(): string {
  return (
    PHOSPHOR_VIEW +
    `<path d="M178,40c-20.65,0-38.73,8.88-50,23.89C116.73,48.88,98.65,40,78,40a62.07,62.07,0,0,0-62,62c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,228.66,240,172,240,102A62.07,62.07,0,0,0,178,40ZM128,214.8C109.74,204.16,32,155.69,32,102A46.06,46.06,0,0,1,78,56c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,155.61,146.24,204.15,128,214.8Z"/>` +
    `</svg>`
  );
}

/** The heart, standing: the same silhouette, solid. */
export function heartFillIcon(): string {
  return (
    PHOSPHOR_VIEW +
    `<path d="M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z"/>` +
    `</svg>`
  );
}

/** A check in a circle: how many players have solved the level. */
export function solversIcon(): string {
  return (
    PHOSPHOR_VIEW +
    `<path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/>` +
    `</svg>`
  );
}

/**
 * Google's "G", in Google's four colours, as Google draws it.
 *
 * The one icon here that is not this site's own. Google's branding rules for
 * its sign-in button are plain: the G is the standard four-colour version, it
 * is never recoloured, and it sits on white. So, unlike every other icon in
 * this file, nothing in it is `currentColor`, and nothing about it should be.
 * Its own viewBox, too, since it is Google's drawing and not a 24-tall one.
 */
export function googleGlyph(): string {
  return (
    `<svg xmlns="${NS}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">` +
    `<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>` +
    `<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>` +
    `<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>` +
    `<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>` +
    `</svg>`
  );
}
