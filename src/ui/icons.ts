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
