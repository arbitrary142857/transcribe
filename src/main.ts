import { createApp } from "./ui/app.js";

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

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`No element with id "${id}"`);
  }
  return element;
}

try {
  await loadScoreFonts();
  createApp({
    setup: required("setup"),
    workspace: required("workspace"),
    signatures: required("signatures"),
    score: required("score"),
    durations: required("durations"),
    tuplets: required("tuplets"),
    actions: required("actions"),
    pitchActions: required("pitch-actions"),
    status: required("status"),
    keyboard: required("keyboard"),
    toolbar: required("toolbar"),
    keyboardArea: required("keyboard-area"),
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  document.getElementById("status")!.textContent = message;
  console.error(error);
}
