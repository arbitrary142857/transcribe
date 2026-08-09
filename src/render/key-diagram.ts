import type { KeySignature } from "../music/key-signature.js";
import { renderStaveDiagram } from "./stave-diagram.js";

/**
 * Room for the clef plus the seven accidentals a signature can reach.
 *
 * Exported because a caller showing this beside another diagram has to know
 * how wide it is in the stave's own units: the two are drawn at whatever width
 * their box gives them, so matching their scale means sizing each box in
 * proportion to this.
 */
export const KEY_DIAGRAM_WIDTH = 124;
const WIDTH = KEY_DIAGRAM_WIDTH;

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
