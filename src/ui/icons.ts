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
 * Flags curl off the top of the stem, one per halving below an eighth.
 *
 * Kept high and tight: they have to stay clear of the augmentation dot, which
 * sits out to the right at notehead height, and two of them have to read as two
 * rather than as one thick smear against the stem.
 */
function flags(x: number, top: number, count: number): string {
  let drawn = "";
  for (let i = 0; i < count; i++) {
    const y = top + i * 3;
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
  const stemTop = 4;
  const filled = value >= 4;

  let parts = head(cx, cy, filled);
  if (value > 1) {
    parts += stem(stemX, stemTop, cy - 0.5);
  }
  if (value >= 8) {
    parts += flags(stemX, stemTop, Math.log2(value) - 2);
  }
  // Right of the notehead and level with it, which is where a dot goes — and,
  // being level with the head, well below where the flags reach.
  const dotX = value === 1 ? cx + 5.6 : stemX + 4;
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
  return svg(
    bracket(2.5, 8) +
      bracket(21.5, 16) +
      `<text x="12" y="${line + 4.6}" text-anchor="middle" font-family="Georgia, serif" font-size="13" font-style="italic" fill="currentColor">${numNotes}</text>`,
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
