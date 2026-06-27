import { KeySignature, keyForFifths } from "../music/key-signature.js";
import type { Mode } from "../music/types.js";
import { renderKeyDiagram } from "../render/key-diagram.js";

/** How far around the circle the chooser goes in each direction. */
const FURTHEST = 7;

const ACCIDENTAL_LABEL: Record<number, string> = {
  [-2]: "𝄫", [-1]: "♭", 0: "", 1: "♯", 2: "𝄪",
};

const keyLabel = (key: KeySignature) =>
  `${key.tonic.letter}${ACCIDENTAL_LABEL[key.tonic.accidental] ?? ""} ${key.mode}`;

export type KeyPanelOptions = {
  clef: string;
  current: KeySignature;
  onPick: (key: KeySignature) => void;
};

/**
 * One signature, drawn, with the two keys that share it underneath.
 *
 * Both buttons sit on the same diagram because both print the same
 * accidentals: choosing a key is picking a signature and then saying which of
 * its two keys you mean.
 */
function diagramCell(
  fifths: number,
  { clef, current, onPick }: KeyPanelOptions,
): HTMLElement {
  const cell = document.createElement("div");
  cell.className = "panel key-cell";

  const staff = document.createElement("div");
  staff.className = "key-staff";
  renderKeyDiagram(staff, keyForFifths(fifths, "major"), clef);
  cell.append(staff);

  const choices = document.createElement("div");
  choices.className = "key-choices";
  for (const mode of ["major", "minor"] as Mode[]) {
    const key = keyForFifths(fifths, mode);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key-choice";
    button.textContent = keyLabel(key);
    button.setAttribute("aria-label", keyLabel(key));
    if (key.isEqual(current)) {
      button.classList.add("is-on");
      button.setAttribute("aria-pressed", "true");
    }
    button.addEventListener("click", () => onPick(key));
    choices.append(button);
  }
  cell.append(choices);

  return cell;
}

/**
 * Build the key chooser: C on its own, sharps above, flats below.
 *
 * Laid out the way the circle of fifths is learned rather than as a list of
 * names — C in the middle at the left, and each row walking outward one
 * accidental at a time, so the shape of a signature and its distance from C are
 * both visible at a glance.
 */
export function renderKeyPanel(
  element: HTMLElement,
  options: KeyPanelOptions,
): void {
  element.replaceChildren();

  const layout = document.createElement("div");
  layout.className = "key-layout";

  // C on its own at the middle left, with the two arms of the circle opening
  // out from it — sharps along the top, flats along the bottom. No labels and
  // no rule between them: the accidentals in each diagram say which arm it is.
  const home = document.createElement("div");
  home.className = "key-home";
  home.append(diagramCell(0, options));

  const arms = document.createElement("div");
  arms.className = "key-arms";
  for (const direction of [1, -1]) {
    const row = document.createElement("div");
    row.className = "key-row";
    for (let step = 1; step <= FURTHEST; step++) {
      row.append(diagramCell(direction * step, options));
    }
    arms.append(row);
  }

  layout.append(home, arms);
  element.append(layout);
}
