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
const SMUFL = {
  quarterNote: "\uE1D5",
  quarterRest: "\uE4E5",
  /**
   * The single-note glyphs, head and stem and flags in one character, indexed
   * by the note value they draw. Codepoints as VexFlow's own `Glyphs` table
   * names them: noteWhole, noteHalfUp, noteQuarterUp, note8thUp, note16thUp,
   * note32ndUp.
   */
  note: {
    1: "\uE1D2",
    2: "\uE1D3",
    4: "\uE1D5",
    8: "\uE1D7",
    16: "\uE1D9",
    32: "\uE1DB",
  } as Record<number, string>,
} as const;

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

const dot = (cx: number, cy: number) =>
  `<circle cx="${cx}" cy="${cy}" r="1.3" fill="currentColor" />`;

/**
 * How each note value sits in its box: where the glyph's origin goes, and how
 * far its ink runs so the dot can sit just past it.
 *
 * The glyphs are Bravura's own single-note characters, so the drawing is the
 * engraver's; what is decided here is only placement. Bravura registers these
 * with the baseline through the notehead's centre, so one `y` lines every head
 * up across the row. The x offsets centre each glyph's ink — a whole note is
 * all head, a flagged note runs a flag's width past its stem — and are optical
 * rather than measured: the ESM build embeds the font whole and keeps no
 * per-glyph metrics to read.
 */
const NOTE_GLYPH: Record<number, { x: number; ink: number }> = {
  1: { x: 8.4, ink: 7.0 },
  2: { x: 9.6, ink: 4.8 },
  4: { x: 9.6, ink: 4.8 },
  8: { x: 7.6, ink: 8.8 },
  16: { x: 7.6, ink: 8.8 },
  32: { x: 7.6, ink: 8.8 },
};

/** Where every notehead sits: low, but with clear floor under the head. */
const NOTE_BASELINE = 18.4;
const NOTE_SIZE = 16;

/**
 * A note of `value` with `dots` augmentation dots.
 *
 * `value` is the denominator of the note's share of a whole note, matching
 * `NoteValue`: 1 is a whole note, 4 a quarter, 16 a sixteenth. The note is
 * Bravura's glyph; the dot stays a plain circle, because an augmentation dot
 * is one, and the font's own comes out too small to read at button size.
 */
export function noteIcon(value: number, dots: number): string {
  const place = NOTE_GLYPH[value] ?? NOTE_GLYPH[4]!;
  let parts = glyph(
    SMUFL.note[value] ?? SMUFL.quarterNote,
    place.x,
    NOTE_BASELINE,
    NOTE_SIZE,
  );
  const dotX = place.x + place.ink + 2.6;
  for (let i = 0; i < dots; i++) {
    parts += dot(dotX + i * 3.4, NOTE_BASELINE);
  }
  return svg(parts);
}

/**
 * Turning a note into silence: the rest it becomes.
 *
 * The rest alone, in Bravura's own drawing — the button's caption already says
 * "Turn to rest", and the old note-arrow-rest triptych was three pictures
 * where one glyph says it.
 */
export function restIcon(): string {
  return svg(glyph(SMUFL.quarterRest, 5.6, 17.5, 22));
}

/**
 * Two quarter notes, Bravura's own, side by side — the pair every tie icon is
 * about. The arc is drawn under the heads, where an engraver puts it when the
 * stems go up.
 */
function tiedPair(): string {
  return (
    glyph(SMUFL.quarterNote, 4, 15, 12) + glyph(SMUFL.quarterNote, 17.5, 15, 12)
  );
}

/** Two notes with a tie between them. */
export function tieIcon(): string {
  return svg(
    tiedPair() +
      `<path d="M6 17.6 Q13.75 22 21.5 17.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />`,
    28,
  );
}

/**
 * The same two notes, with the tie broken open between them: the tie is what
 * is being taken away, so what is missing has to be the visible part.
 */
export function untieIcon(): string {
  return svg(
    tiedPair() +
      `<path d="M6 17.6 Q8.5 20.2 10.8 20.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />` +
      `<path d="M21.5 17.6 Q19 20.2 16.7 20.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />`,
    28,
  );
}

/**
 * An eraser, for taking the pitch off a note and leaving its rhythm.
 *
 * Phosphor's, like the rest of the interface icons: rubbing something out is
 * a thing every icon set draws, and this reads as it at button size where an
 * X notehead on a stem read as a note nobody could name.
 */
export function eraserIcon(): string {
  return phosphor(
    `<line x1="96" y1="104" x2="160" y2="168" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>` +
      `<path d="M112,216,219.31,108.69a16,16,0,0,0,0-22.63L177.94,44.69a16,16,0,0,0-22.63,0L36.69,163.31a16,16,0,0,0,0,22.63L66.75,216H216" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>`,
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

/** A metronome: Phosphor's, case and beating rod. */
export function metronomeIcon(): string {
  return phosphor(
    `<path d="M56,216a8,8,0,0,1-7.63-10.43l50.91-160A8,8,0,0,1,106.91,40h42.18a8,8,0,0,1,7.62,5.57l50.91,160A8,8,0,0,1,200,216Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>` +
      `<line x1="128" y1="168" x2="208" y2="80" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>` +
      `<line x1="60.34" y1="168" x2="195.66" y2="168" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>`,
  );
}

/**
 * The marker that follows the music, shown standing on a note.
 *
 * One note under the marker and one clear of it, which is what says the marker
 * moves. The notes are Bravura's own, stems and all, and the marker is a bar
 * centred on the staff it rides down.
 *
 * Drawn to its own geometry rather than the shared staff above: those
 * constants put a staff in the lower half of the box, which left this icon
 * looking half the size of the ones beside it. Here the staff is centred and
 * the marker reaches nearly the full height, so the icon fills its button.
 */
export function playheadIcon(): string {
  const top = 4;
  const gap = 4;
  let lines = "";
  for (let i = 0; i < 5; i++) {
    const y = top + i * gap;
    // Fainter than the notes and the marker on purpose: the staff is the
    // ground this happens on, and at button size five full-strength lines
    // are all anyone sees.
    lines += `<line x1="1" y1="${y}" x2="23" y2="${y}" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" opacity="0.4" />`;
  }
  return svg(
    lines +
      // The box around the note, which is what the page itself draws over the
      // score. Outlined as well as washed: a wash alone has no edge, and in
      // white on the lit accent an edgeless wash is a smudge.
      `<rect x="2.6" y="1.6" width="8.6" height="20.8" rx="1.6" fill="currentColor" fill-opacity="0.22" ` +
      `stroke="currentColor" stroke-width="1.1" stroke-opacity="0.9" />` +
      glyph(SMUFL.quarterNote, 4.2, 16, 14) +
      glyph(SMUFL.quarterNote, 14.4, 12, 14),
  );
}

/** A padlock, closed: the tempo is held and edits move in step. Phosphor's. */
export function lockClosedIcon(): string {
  return phosphor(
    `<path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96Z"/>`,
  );
}

/** The same padlock with its shackle swung open: the tempo follows the marks. */
export function lockOpenIcon(): string {
  return phosphor(
    `<rect x="40" y="88" width="176" height="128" rx="8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>` +
      `<path d="M88,88V56a40,40,0,0,1,40-40c19.35,0,36.29,13.74,40,32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>`,
  );
}

export function playIcon(): string {
  return phosphor(
    `<path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z"/>`,
  );
}

export function pauseIcon(): string {
  return phosphor(
    `<path d="M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z"/>`,
  );
}

/** Back to the top of the section: Phosphor's skip-back. */
export function restartIcon(): string {
  return phosphor(
    `<path d="M208,47.88V208.12a16,16,0,0,1-24.43,13.43L64,146.77V216a8,8,0,0,1-16,0V40a8,8,0,0,1,16,0v69.23L183.57,34.45A15.95,15.95,0,0,1,208,47.88Z"/>`,
  );
}

/** What reaches the end starts again: Phosphor's repeat. */
export function loopIcon(): string {
  return phosphor(
    `<polyline points="200 88 224 64 200 40" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>` +
      `<path d="M32,128A64,64,0,0,1,96,64H224" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>` +
      `<polyline points="56 168 32 192 56 216" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>` +
      `<path d="M224,128a64,64,0,0,1-64,64H32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>`,
  );
}

/** Put this back the way it started: Phosphor's arrow-counter-clockwise. */
export function restoreIcon(): string {
  return phosphor(
    `<polyline points="24 56 24 104 72 104" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>` +
      `<path d="M67.59,192A88,88,0,1,0,65.77,65.77L24,104" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>`,
  );
}

/** Phosphor's speaker, sounding — the notes toggle's badge while notes play. */
const SPEAKER_ON =
  `<path d="M80,168H32a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H80l72-56V224Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>` +
  `<line x1="80" y1="88" x2="80" y2="168" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>` +
  `<path d="M192,106.85a32,32,0,0,1,0,42.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>` +
  `<path d="M221.67,80a72,72,0,0,1,0,96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>`;

/** The same speaker struck through: the notes are not heard. */
const SPEAKER_OFF =
  `<line x1="48" y1="40" x2="208" y2="216" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>` +
  `<line x1="80" y1="88" x2="80" y2="168" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>` +
  `<path d="M192,106.87a32,32,0,0,1,0,42.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>` +
  `<path d="M152,154.4V224L80,168H32a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H80l6.82-5.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>` +
  `<polyline points="112.15 62.99 152 32 152 106.83" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>`;

/**
 * Where the speaker stands in a two-glyph icon, and how wide the box is.
 *
 * Both icons that pair a thing with a speaker use these, so the two read as
 * one family: the same gap between the pair, the same speaker in the same
 * place. The gap is the point of them — shoulder to shoulder the two glyphs
 * ran together into one shape, and at twenty pixels across that shape said
 * nothing.
 */
const SPEAKER_AT = 250;
const SPEAKER_SCALE = 0.72;
const PAIRED_WIDTH = 442;

/**
 * Whether the transcription is heard: Phosphor's music-notes with the speaker
 * standing beside them, sounding or struck through. A wide icon on purpose —
 * the two glyphs stand apart with the box's width between them, and the pair
 * of pictures is the whole state: the button that shows this carries no words.
 */
export function notesHeardIcon(on: boolean): string {
  return (
    `<svg xmlns="${NS}" viewBox="0 0 ${PAIRED_WIDTH} 256" fill="currentColor" aria-hidden="true" focusable="false">` +
    `<g transform="translate(0 14) scale(0.9)"><path d="M212.92,17.71a7.89,7.89,0,0,0-6.86-1.46l-128,32A8,8,0,0,0,72,56V166.1A36,36,0,1,0,88,196V102.25l112-28V134.1A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.71Z"/></g>` +
    `<g transform="translate(${SPEAKER_AT} 38) scale(${SPEAKER_SCALE})">${on ? SPEAKER_ON : SPEAKER_OFF}</g>` +
    `</svg>`
  );
}

/**
 * The piano beside a speaker, sounding or struck through.
 *
 * The keyboard's own version of `notesHeardIcon`, and drawn to the same plan:
 * two glyphs set apart in one wide box, where the pair of pictures is the
 * whole state and the button carries no words. There the notes are the
 * transcription playing along with the video; here they are the key you just
 * pressed.
 */
export function pianoHeardIcon(on: boolean): string {
  return (
    `<svg xmlns="${NS}" viewBox="0 0 ${PAIRED_WIDTH} 256" fill="currentColor" aria-hidden="true" focusable="false">` +
    // A stretch of keyboard seen from above: the bed, two gaps dividing three
    // whites, and two blacks laid over them. Three keys rather than seven —
    // this is drawn at about twenty pixels across, and at that size a full
    // octave collapses into a grey smudge. What has to survive the shrink is
    // the shape of the thing, and three keys still say piano.
    `<g transform="translate(4 52)">` +
    `<rect x="8" y="8" width="192" height="148" rx="12" fill="none" stroke="currentColor" stroke-width="16"/>` +
    `<path d="M72 16V148M136 16V148" stroke="currentColor" stroke-width="12"/>` +
    `<rect x="52" y="8" width="34" height="76" rx="3"/>` +
    `<rect x="122" y="8" width="34" height="76" rx="3"/>` +
    `</g>` +
    `<g transform="translate(${SPEAKER_AT} 38) scale(${SPEAKER_SCALE})">${on ? SPEAKER_ON : SPEAKER_OFF}</g>` +
    `</svg>`
  );
}

/**
 * The way out of a box: two strokes crossed.
 *
 * Drawn rather than typed. As a multiplication sign it could not be centred in
 * its button at any line height — the glyph's ink sits above the baseline, and
 * a line box centred on the baseline leaves the ink riding high — so what the
 * eye sees was never in the middle of what the pointer presses. Two strokes
 * through the middle of a square are centred by construction.
 */
export function closeIcon(): string {
  return phosphor(
    `<line x1="200" y1="56" x2="56" y2="200" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="20"/>` +
      `<line x1="200" y1="200" x2="56" y2="56" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="20"/>`,
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
 * The Phosphor glyphs.
 *
 * The icons here that are not this site's own drawing, nor Bravura's. Every
 * shape passed through `phosphor()` is Phosphor Icons' (phosphoricons.com):
 * `pepper` and `heart` in their `regular` and `fill` weights, two weights of
 * one silhouette each, which is what lets a display lay the filled shape
 * under the outlined one; `check-circle` regular for the solved-by figure;
 * and the player's controls above — `play`, `pause`, `skip-back` and
 * `music-notes` in `fill`, `repeat`, `arrow-counter-clockwise`, `metronome`,
 * `lock-simple` open and closed, `speaker-high`, `speaker-slash`, `eraser`
 * and `list` in `regular`. Phosphor Icons is MIT
 * licensed, Copyright (c) 2023 Phosphor Icons; this notice is the
 * attribution the licence asks to travel with the shapes. Their viewBox,
 * too (256, not 24); the CSS sizes them in ems.
 */
const PHOSPHOR_VIEW = `<svg xmlns="${NS}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">`;

/** One Phosphor icon, wrapped for a button. Declared above, used above too. */
function phosphor(inner: string): string {
  return `${PHOSPHOR_VIEW}${inner}</svg>`;
}

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
