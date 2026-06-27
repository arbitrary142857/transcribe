import { sampleMelodies, type SampleMelodyId } from "./melodies/samples.js";
import {
  IncompleteMeasureError,
  MeasureOverflowError,
  TupletAcrossBarlineError,
  UngroupedTupletError,
} from "./music/measure.js";
import { renderMelody } from "./render/render-melody.js";

/** Extra width on the first bar for clef / key / time (matches render defaults). */
const FIRST_BAR_EXTRA = 60;
const DEFAULT_BAR_WIDTH = 200;

const statusEl = document.getElementById("status");
const barWidthInput = document.getElementById(
  "bar-width",
) as HTMLInputElement | null;
const barWidthValue = document.getElementById("bar-width-value");
const buttons = document.querySelectorAll<HTMLButtonElement>(
  "button[data-melody]",
);

let activeMelodyId: SampleMelodyId | null = null;

function currentBarWidth(): number {
  const raw = barWidthInput ? Number(barWidthInput.value) : DEFAULT_BAR_WIDTH;
  return Number.isFinite(raw) ? raw : DEFAULT_BAR_WIDTH;
}

function setStatus(message: string): void {
  if (statusEl) statusEl.textContent = message;
}

function setPressed(activeId: SampleMelodyId | null): void {
  for (const button of buttons) {
    const id = button.dataset.melody;
    button.setAttribute("aria-pressed", id === activeId ? "true" : "false");
  }
}

function showMelody(id: SampleMelodyId): void {
  activeMelodyId = id;
  setPressed(id);
  setStatus("");
  const barWidth = currentBarWidth();
  try {
    const sample = sampleMelodies[id];
    renderMelody(sample.create(), {
      barWidth,
      firstWidth: barWidth + FIRST_BAR_EXTRA,
      clef: "clef" in sample ? sample.clef : "treble",
    });
  } catch (error) {
    const output = document.getElementById("output");
    output?.replaceChildren();
    if (
      error instanceof MeasureOverflowError ||
      error instanceof IncompleteMeasureError ||
      error instanceof TupletAcrossBarlineError ||
      error instanceof UngroupedTupletError
    ) {
      setStatus(error.message);
      return;
    }
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    const id = button.dataset.melody;
    if (id && id in sampleMelodies) {
      showMelody(id as SampleMelodyId);
    }
  });
}

if (barWidthInput) {
  const syncLabel = (): void => {
    if (barWidthValue) barWidthValue.textContent = String(currentBarWidth());
  };
  syncLabel();
  barWidthInput.addEventListener("input", () => {
    syncLabel();
    if (activeMelodyId) showMelody(activeMelodyId);
  });
}

const initial = new URLSearchParams(window.location.search).get("melody");
if (initial && initial in sampleMelodies) {
  showMelody(initial as SampleMelodyId);
}
