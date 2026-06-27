import type { TimeSignature } from "../music/types.js";
import { renderStaveDiagram } from "../render/stave-diagram.js";

const CLEFS = ["treble", "bass"] as const;

const METERS: readonly TimeSignature[] = [
  { beats: 4, beatUnit: 4 },
  { beats: 3, beatUnit: 4 },
  { beats: 2, beatUnit: 4 },
  { beats: 6, beatUnit: 8 },
  { beats: 9, beatUnit: 8 },
  { beats: 12, beatUnit: 8 },
  { beats: 5, beatUnit: 8 },
];

const meterLabel = (meter: TimeSignature) => `${meter.beats}/${meter.beatUnit}`;

/**
 * Only as wide as the thing being shown.
 *
 * A stave running on past its clef reads as an empty bar waiting for music; cut
 * back to the glyph it carries, it reads as the clef itself.
 */
const CLEF_WIDTH = 42;
const METER_WIDTH = 40;

/** A clef overhangs the staff; a meter sits inside it. */
const CLEF_HEADROOM = { above: 24, below: 20 };
const METER_HEADROOM = { above: 7, below: 7 };

export type SetupChoice = { clef?: string; meter?: TimeSignature };

export type SetupPanelOptions = {
  chosen: SetupChoice;
  onChoose: (choice: SetupChoice) => void;
  onSubmit: (clef: string, meter: TimeSignature) => void;
};

/**
 * A row of diagrams to choose from, in a plain box.
 *
 * No heading: a row of clefs is a row of clefs, and a word above it only
 * repeats what the pictures already say.
 */
function chooserRow(): { panel: HTMLElement; row: HTMLElement } {
  const panel = document.createElement("section");
  panel.className = "panel setup-panel";
  const row = document.createElement("div");
  row.className = "setup-row";
  panel.append(row);
  return { panel, row };
}

function cell(
  label: string,
  selected: boolean,
  run: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "setup-cell";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(selected));
  if (selected) {
    button.classList.add("is-on");
  }
  button.addEventListener("click", run);
  return button;
}

/**
 * Ask for the clef and the meter, once.
 *
 * Both are settled before any music exists and fixed after: a different meter
 * would leave events no longer fitting their bars, and the clef is chosen for
 * the range the music will sit in. Choosing does not commit — the two are
 * picked, seen together, and then submitted, since pressing the second should
 * not carry the page away before it has been looked at.
 */
export function renderSetupPanel(
  element: HTMLElement,
  { chosen, onChoose, onSubmit }: SetupPanelOptions,
): void {
  element.replaceChildren();

  const clefs = chooserRow();
  for (const clef of CLEFS) {
    const button = cell(`${clef} clef`, chosen.clef === clef, () =>
      onChoose({ ...chosen, clef }),
    );
    const staff = document.createElement("div");
    staff.className = "setup-staff";
    renderStaveDiagram(
      staff,
      CLEF_WIDTH,
      (stave) => stave.addClef(clef),
      CLEF_HEADROOM,
    );
    button.append(staff);
    clefs.row.append(button);
  }

  const meters = chooserRow();
  for (const meter of METERS) {
    const selected =
      chosen.meter?.beats === meter.beats &&
      chosen.meter?.beatUnit === meter.beatUnit;
    const button = cell(`${meterLabel(meter)} time`, selected, () =>
      onChoose({ ...chosen, meter }),
    );
    const staff = document.createElement("div");
    staff.className = "setup-staff";
    renderStaveDiagram(
      staff,
      METER_WIDTH,
      (stave) => stave.addTimeSignature(meterLabel(meter)),
      METER_HEADROOM,
    );
    button.append(staff);
    meters.row.append(button);
  }

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "setup-submit";
  submit.textContent = "Start writing";
  submit.disabled = !chosen.clef || !chosen.meter;
  submit.addEventListener("click", () => {
    if (chosen.clef && chosen.meter) {
      onSubmit(chosen.clef, chosen.meter);
    }
  });

  element.append(clefs.panel, meters.panel, submit);
}
