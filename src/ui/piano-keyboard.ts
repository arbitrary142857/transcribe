import type { Pitch } from "../music/index.js";
import type { Accidental } from "../music/types.js";

/** The span of pitches a keyboard covers, as MIDI note numbers. */
export type KeyboardRange = { lowest: number; highest: number };

/**
 * How far the keyboard reaches for each clef.
 *
 * Each range stops where the staff runs out of legibility: the outermost key is
 * the note sitting just past the fourth ledger line, above and below. For treble
 * that is C3 (four below E4) up to A6 (four above F5); for bass, the same count
 * around G2–A3 gives E1 up to C5.
 *
 * Change a row here to widen or narrow a clef — nothing else depends on the
 * numbers, and `rangeForClef` falls back to treble for any clef not listed.
 */
export const CLEF_RANGES: Record<string, KeyboardRange> = {
  treble: { lowest: 48, highest: 93 }, // C3 – A6
  bass: { lowest: 28, highest: 72 }, // E1 – C5
};

export function rangeForClef(clef: string): KeyboardRange {
  return CLEF_RANGES[clef] ?? CLEF_RANGES.treble!;
}

const ACCIDENTAL_GLYPH: Record<Accidental, string> = {
  [-2]: "\u{1D12B}",
  [-1]: "♭",
  0: "♮",
  1: "♯",
  2: "\u{1D12A}",
};

/** Semitones above C that have no white key of their own. */
const BLACK_CHROMAS = new Set([1, 3, 6, 8, 10]);

const chromaOf = (midi: number) => ((midi % 12) + 12) % 12;
const isBlackKey = (midi: number) => BLACK_CHROMAS.has(chromaOf(midi));

export type PianoKeyboardOptions = {
  clef?: string;
  /** How to name a key: the spelling that pitch would be written with. */
  spell: (midi: number) => Pitch;
  onPick: (midi: number) => void;
};

export type PianoKeyboard = {
  readonly range: KeyboardRange;
  /** Mark the key sounding `midi`, or clear the mark with `undefined`. */
  highlight(midi: number | undefined): void;
  /**
   * Whether the keys can be pressed at all.
   *
   * Off while the selected note is one the puzzle has already confirmed. The
   * alternative is a keyboard that looks live and answers every press with a
   * refusal, which is a worse way to learn a note is settled than the keys
   * simply going quiet.
   */
  setEnabled(enabled: boolean): void;
};

/**
 * Build a scrollable piano.
 *
 * Each key carries one name — the spelling that pitch would be written with in
 * the current key signature, which is also what pressing the key produces. The
 * names are labels, not controls: the whole key is the button.
 */
export function createPianoKeyboard(
  element: HTMLElement,
  { clef = "treble", spell, onPick }: PianoKeyboardOptions,
): PianoKeyboard {
  element.replaceChildren();

  const range = rangeForClef(clef);
  const scroller = document.createElement("div");
  scroller.className = "keyboard-scroller";

  const keys = document.createElement("div");
  keys.className = "keyboard-keys";

  const byMidi = new Map<number, HTMLButtonElement>();
  const centreOn = Math.round((range.lowest + range.highest) / 2);
  let whiteIndex = 0;
  let centreOffset = 0;

  for (let midi = range.lowest; midi <= range.highest; midi++) {
    const black = isBlackKey(midi);
    const key = document.createElement("button");
    key.type = "button";
    key.className = black ? "key key-black" : "key key-white";
    key.dataset.midi = String(midi);

    if (black) {
      // Black keys sit over the boundary between the white keys either side.
      key.style.setProperty("--white-index", String(whiteIndex));
    } else {
      if (midi <= centreOn) {
        centreOffset = whiteIndex;
      }
      whiteIndex += 1;
    }

    const pitch = spell(midi);
    const name = document.createElement("span");
    name.className = "key-name";
    name.textContent = `${pitch.letter}${ACCIDENTAL_GLYPH[pitch.accidental]}${pitch.octave}`;
    key.append(name);

    key.addEventListener("click", () => onPick(midi));
    byMidi.set(midi, key);
    keys.append(key);
  }

  scroller.append(keys);
  element.append(scroller);

  // Open on the middle of the range rather than at the bottom end.
  requestAnimationFrame(() => {
    const whiteKeyWidth = keys.querySelector(".key-white")?.clientWidth ?? 0;
    scroller.scrollLeft = Math.max(
      0,
      centreOffset * whiteKeyWidth - scroller.clientWidth / 2,
    );
  });

  let marked: HTMLElement | undefined;

  return {
    range,
    highlight(midi) {
      marked?.classList.remove("key-selected");
      marked = midi === undefined ? undefined : byMidi.get(midi);
      marked?.classList.add("key-selected");
      // A selected note can be off-screen after arrow-key navigation.
      marked?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },

    setEnabled(enabled) {
      keys.classList.toggle("is-off", !enabled);
      // Announced as well as drawn: the keys are buttons, and a screen reader
      // reading out eighty live buttons that do nothing is the same problem in
      // another medium.
      keys.setAttribute("aria-disabled", String(!enabled));
      for (const key of byMidi.values()) {
        key.disabled = !enabled;
      }
    },
  };
}
