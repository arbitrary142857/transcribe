import type { KeySignature } from "../music/key-signature.js";
import { renderStaveDiagram } from "./stave-diagram.js";

/** Room for the clef plus the seven accidentals a signature can reach. */
const WIDTH = 124;

/**
 * Draw one key signature as it will appear on the stave.
 *
 * A signature is easier to recognise by its shape than by its name — four
 * sharps is a picture, "E major" is a fact you have to recall — so the chooser
 * shows the thing itself, drawn with the clef the melody is actually in.
 */
export function renderKeyDiagram(
  element: HTMLElement,
  key: KeySignature,
  clef: string,
): void {
  renderStaveDiagram(element, WIDTH, (stave) => {
    stave.addClef(clef);
    stave.addKeySignature(key.toString());
  });
}
