import { Renderer, Stave } from "vexflow";

/**
 * A canvas roomy enough that nothing is clipped while drawing. What is finally
 * shown is decided by the view box below, not by this.
 */
const CANVAS = 240;

/** Where the stave is placed on that canvas. */
const STAVE_Y = 40;

/**
 * Ink above the top line and below the bottom one.
 *
 * A clef reaches well past the staff in both directions; a time signature sits
 * inside it. Reserving a clef's worth for everything leaves a meter marooned in
 * a tall, narrow box, so each caller says how much room its own glyph needs.
 */
export type Headroom = { above: number; below: number };

const DEFAULT_HEADROOM: Headroom = { above: 28, below: 26 };

/**
 * Draw a bare stave carrying one thing — a clef, a meter, a key signature.
 *
 * The view box is set by hand rather than fitted to the drawing. A `Stave`
 * reserves several staff-heights above and below itself for music it does not
 * have here, and VexFlow renders glyphs as text whose reported box is bigger
 * than the ink; measuring either would leave the staff a smudge in the middle
 * of a lot of nothing.
 */
export function renderStaveDiagram(
  element: HTMLElement,
  width: number,
  draw: (stave: Stave) => void,
  { above, below }: Headroom = DEFAULT_HEADROOM,
): void {
  element.replaceChildren();

  const renderer = new Renderer(element as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(CANVAS, CANVAS);
  const context = renderer.getContext();

  // Barlines off: the subject is what the stave carries, and bars at either end
  // would read as an empty measure instead.
  const stave = new Stave(0, STAVE_Y, width, { leftBar: false, rightBar: false });
  draw(stave);
  stave.setContext(context).draw();

  const svg = element.querySelector("svg");
  if (!svg) {
    return;
  }

  // Asked of the stave rather than worked out from `STAVE_Y`: a `Stave` keeps
  // several staff-heights of headroom inside itself, so its first line is a
  // long way below the y it was given.
  const top = stave.getYForLine(0);
  const bottom = stave.getYForLine(stave.getNumLines() - 1);
  svg.setAttribute(
    "viewBox",
    `0 ${top - above} ${width} ${bottom - top + above + below}`,
  );
  svg.setAttribute("width", "100%");
  svg.removeAttribute("height");
  svg.style.display = "block";
  svg.style.width = "100%";
  svg.style.height = "auto";
}
