import { abMajorPhrase } from "./melodies/ab-major-phrase.js";
import {
  IncompleteMeasureError,
  MeasureOverflowError,
  TupletAcrossBarlineError,
  UngroupedTupletError,
} from "./music/measure.js";
import { Note } from "./music/note-event.js";
import type { Pitch } from "./music/pitch.js";
import {
  spellForMelodyEvent,
  spellingContext,
  spellMidi,
} from "./music/spelling.js";
import { createMelodyView } from "./render/melody-view.js";
import { createPianoKeyboard, rangeForClef } from "./ui/piano-keyboard.js";

const CLEF = "treble";

const keyboardElement = document.getElementById("keyboard");

/** Report the errors `splitIntoMeasures` raises, which are the ones worth naming. */
function describe(error: unknown): string {
  if (
    error instanceof MeasureOverflowError ||
    error instanceof IncompleteMeasureError ||
    error instanceof TupletAcrossBarlineError ||
    error instanceof UngroupedTupletError
  ) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Make sure the score fonts are usable before anything is measured.
 *
 * Bar widths come from measuring the glyphs, and a canvas measures a font it
 * does not have yet against a fallback — so without this the first layout is
 * built from the wrong numbers and every bar shifts as soon as anything
 * redraws. `document.fonts.ready` alone is not enough: it reports "loaded"
 * while these faces are still unrequested.
 */
async function loadScoreFonts(): Promise<void> {
  if (!document.fonts) {
    return;
  }
  await Promise.all([
    document.fonts.load("30pt Bravura"),
    document.fonts.load("10pt Academico"),
  ]);
  await document.fonts.ready;
}

const melody = abMajorPhrase();

try {
  await loadScoreFonts();
  const view = createMelodyView(melody, { elementId: "score", clef: CLEF });
  const range = rangeForClef(CLEF);

  /**
   * How a pitch is named on the keyboard: spelled against the key signature
   * alone. Pressing a key spells against the bar it lands in as well, which
   * only differs when an earlier accidental in that bar is still in force.
   */
  const nameInKey = (midi: number): Pitch =>
    spellMidi(midi, spellingContext(melody.keySignature, []));

  const keyboard = keyboardElement
    ? createPianoKeyboard(keyboardElement, {
        clef: CLEF,
        spell: nameInKey,
        onPick: setPitchTo,
      })
    : undefined;

  /** Retune the selected note, spelling it to suit the key and the bar. */
  function setPitchTo(midi: number): void {
    const anchor = view.getAnchor();
    if (anchor === undefined) {
      console.log("Select a note on the stave first.");
      return;
    }
    if (!(melody.getEvent(anchor) instanceof Note)) {
      console.log("A rest has no pitch to change.");
      return;
    }
    if (midi < range.lowest || midi > range.highest) {
      return;
    }

    const chosen = spellForMelodyEvent(melody, anchor, midi);
    melody.setPitch(anchor, chosen);
    view.refresh();
    keyboard?.highlight(midi);
    console.log(`Set note ${anchor} to ${chosen}.`);
  }

  /** The pitch of the selected note, if one is selected and it is not a rest. */
  function selectedPitch(): Pitch | undefined {
    const anchor = view.getAnchor();
    if (anchor === undefined) return undefined;
    const event = melody.getEvent(anchor);
    return event instanceof Note ? event.pitch : undefined;
  }

  view.onSelectionChange((anchor) => {
    const pitch = selectedPitch();
    keyboard?.highlight(pitch?.toMidi());
    if (anchor === undefined) {
      console.log("Selection cleared.");
      return;
    }
    const size = view.getSelection().size;
    const tied = size > 1 ? ` (tied group of ${size})` : "";
    console.log(`Selected note ${anchor}: ${pitch ?? "rest"}${tied}.`);
  });

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        view.moveSelection(event.key === "ArrowRight" ? 1 : -1);
        break;
      case "ArrowUp":
      case "ArrowDown": {
        const pitch = selectedPitch();
        if (!pitch) return;
        setPitchTo(pitch.toMidi() + (event.key === "ArrowUp" ? 1 : -1));
        break;
      }
      default:
        return;
    }
    // Only once a key has been handled, so the page still scrolls otherwise.
    event.preventDefault();
  });
} catch (error) {
  console.error(describe(error));
}
