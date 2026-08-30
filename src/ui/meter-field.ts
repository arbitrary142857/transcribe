import type { TimeSignature } from "../music/types.js";

/** Which of the two boxes something is being said about. */
export type MeterBox = "top" | "bottom";

/**
 * The units a beat can be written in.
 *
 * Every value here is a note the score can actually draw — `NoteValue` names
 * six, and these are the four anybody counts in. The whole note and the
 * thirty-second are left out on purpose: 4/1 and 4/32 are readable by the ADTs
 * and by nothing else.
 */
export const BEAT_UNITS: readonly number[] = [2, 4, 8, 16];

/**
 * The most beats a bar may hold.
 *
 * Two digits, and under the thirty-two a bar of thirty-second notes would
 * imply. Past this it is not a meter anybody counts; the codec's own ceiling
 * is higher still and is a guard against nonsense rather than a limit on
 * meters.
 */
export const BEATS_MAX = 31;

/**
 * What the two boxes say, and which of them is wrong for saying it.
 *
 * A box left empty is not wrong — it is a box nobody has typed in yet, and
 * reddening it the moment the page is drawn would accuse somebody of a mistake
 * they have not made. So `wrong` is empty and there is no meter either, which
 * is exactly the state the page starts in.
 */
export type MeterReading = {
  readonly meter?: TimeSignature;
  readonly wrong: readonly MeterBox[];
};

/**
 * The notation font's own digits, `timeSig0` first and the rest in order.
 *
 * SMuFL puts them in the private use area, so these are the codepoints the
 * score itself draws a time signature with — the same glyphs the six buttons
 * carry on their staves, taken without a stave.
 */
const TIME_SIGNATURE_ZERO = 0xe080;

const inNotation = (value: number): string =>
  [...String(value)]
    .map((digit) => String.fromCodePoint(TIME_SIGNATURE_ZERO + Number(digit)))
    .join("");

/** One or two digits and nothing else: no signs, no points, no exponents. */
const DIGITS = /^\d{1,2}$/;

const readNumber = (text: string): number | undefined =>
  DIGITS.test(text) ? Number(text) : undefined;

/**
 * Read a meter out of the two boxes.
 *
 * Both numbers are checked against what the music can be written in rather
 * than against what looks like a meter: the beat unit has to be a note value
 * the score can draw, and the count has to fit in the two digits the boxes
 * hold. Everything inside those bounds is accepted, 13/16 included — unusual
 * is not the same as wrong, and the editor writes it as happily as 4/4.
 */
export function readMeter(top: string, bottom: string): MeterReading {
  const beats = readNumber(top.trim());
  const beatUnit = readNumber(bottom.trim());
  const wrong: MeterBox[] = [];

  const topBlank = top.trim() === "";
  const bottomBlank = bottom.trim() === "";
  if (!topBlank && (beats === undefined || beats < 1 || beats > BEATS_MAX)) {
    wrong.push("top");
  }
  if (!bottomBlank && (beatUnit === undefined || !BEAT_UNITS.includes(beatUnit))) {
    wrong.push("bottom");
  }

  if (wrong.length > 0 || beats === undefined || beatUnit === undefined) {
    return { wrong };
  }
  return { meter: { beats, beatUnit }, wrong };
}

export type MeterField = {
  readonly element: HTMLElement;
  /** Show a meter, or clear both boxes. Declined while a box is being typed in. */
  show(meter: TimeSignature | undefined): void;
};

export type MeterFieldOptions = {
  /**
   * The boxes were typed in: a meter, or nothing while they do not name one.
   *
   * Per keystroke, unlike the timecode boxes. There is nothing to compose
   * here — a meter is at most four characters — and the numerals beside the
   * boxes are the whole point of typing in them, so they follow the typing.
   */
  onChange(meter: TimeSignature | undefined): void;
};

function box(label: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 2;
  input.className = "meter-field-input";
  input.placeholder = "—";
  input.setAttribute("aria-label", label);
  return input;
}

/**
 * The custom meter chooser: two boxes and the signature they write.
 *
 * The meter is drawn out without the stave it usually stands on — one numeral
 * over another and nothing else, because a stave is a place for music and this
 * is a control. The boxes are stacked the same way beside it, each on the line
 * of the numeral it writes, so the thing being typed and the thing being
 * chosen are one shape.
 *
 * The numerals follow every keystroke. What cannot be read is not guessed at:
 * the box holding it reddens, and both numerals give way to a question mark
 * rather than standing at the last meter that happened to parse — which would
 * say the page had understood something it had not.
 */
export function createMeterField({ onChange }: MeterFieldOptions): MeterField {
  const element = document.createElement("div");
  element.className = "meter-field";

  const boxes = document.createElement("div");
  boxes.className = "meter-field-boxes";
  const top = box("Beats in a bar");
  const bottom = box("The note a beat is written in");
  boxes.append(top, bottom);

  // The signature itself: two numerals stacked, or the one question mark that
  // stands for both when they cannot be read.
  const glyph = document.createElement("div");
  glyph.className = "meter-field-glyph";
  const glyphTop = document.createElement("span");
  glyphTop.className = "meter-field-numeral";
  const glyphBottom = document.createElement("span");
  glyphBottom.className = "meter-field-numeral";
  glyph.append(glyphTop, glyphBottom);
  glyph.setAttribute("aria-hidden", "true");

  element.append(boxes, glyph);

  /** Dress the boxes and the numerals in what they now say. */
  function paint(): MeterReading {
    const reading = readMeter(top.value, bottom.value);
    top.classList.toggle("is-wrong", reading.wrong.includes("top"));
    bottom.classList.toggle("is-wrong", reading.wrong.includes("bottom"));
    top.setAttribute("aria-invalid", String(reading.wrong.includes("top")));
    bottom.setAttribute(
      "aria-invalid",
      String(reading.wrong.includes("bottom")),
    );

    const unread = reading.meter === undefined;
    glyph.classList.toggle("is-unread", unread);
    glyphTop.textContent = unread ? "?" : inNotation(reading.meter!.beats);
    glyphBottom.textContent = unread ? "" : inNotation(reading.meter!.beatUnit);
    return reading;
  }

  /**
   * Paint, and say what was read.
   *
   * Only for typing. `show()` paints without this, because what it is showing
   * is what the page just told it — answering that with a change would be the
   * page telling itself.
   */
  const read = () => onChange(paint().meter);

  for (const input of [top, bottom]) {
    input.addEventListener("input", read);
  }
  paint();

  return {
    element,

    show(meter) {
      // Never over the box being typed in: a default picked with the pointer
      // fills both, but a keystroke must not be answered by a rewrite.
      const typing = document.activeElement;
      if (typing !== top && typing !== bottom) {
        top.value = meter === undefined ? "" : String(meter.beats);
        bottom.value = meter === undefined ? "" : String(meter.beatUnit);
        paint();
      }
    },
  };
}
