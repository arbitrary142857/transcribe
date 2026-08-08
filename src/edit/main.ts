import {
  isTranscriptionId,
  type TranscriptionRecord,
} from "../shared/transcription.js";
import { createApp, type Entry } from "../ui/app.js";

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

/** Said instead of the editor, with the way back to the list. */
function showTrouble(message: string): void {
  const setup = required("setup");
  setup.replaceChildren();

  const panel = document.createElement("section");
  panel.className = "panel setup-panel level-trouble";

  const heading = document.createElement("h1");
  heading.className = "page-title";
  heading.textContent = "That level could not be opened";

  const said = document.createElement("p");
  said.className = "page-lede";
  said.textContent = message;

  const back = document.createElement("p");
  const link = document.createElement("a");
  link.href = "/";
  link.textContent = "Back to the levels";
  back.append(link);

  panel.append(heading, said, back);
  setup.append(panel);
}

/**
 * How this page was arrived at.
 *
 * Without a level in the address it is a fresh transcription and the setup
 * page asks for everything. With one, the whole record is fetched before the
 * editor is built at all — `createApp` mounts synchronously, and a melody that
 * turned up afterwards would arrive to a page already showing setup.
 *
 * The id is checked before it is sent. Every query binds its values, so a
 * strange one could do no harm, but there is nothing to look up and so nothing
 * is looked up.
 */
async function readEntry(): Promise<Entry | { trouble: string }> {
  const asked = new URLSearchParams(window.location.search).get("level");
  if (asked === null) {
    return { kind: "new" };
  }
  if (!isTranscriptionId(asked)) {
    return { trouble: "That address does not name a level." };
  }

  let response: Response;
  try {
    response = await fetch(`/api/levels/${asked}/source`, {
      headers: { accept: "application/json" },
    });
  } catch {
    return { trouble: "The server could not be reached. Try again in a moment." };
  }

  if (response.status === 404) {
    return { trouble: "There is no level with that address." };
  }
  if (!response.ok) {
    return { trouble: `The server answered ${response.status}.` };
  }

  try {
    const record = (await response.json()) as TranscriptionRecord;
    return { kind: "edit", id: asked, record };
  } catch {
    // A reply that is not JSON is not the server's — a captive portal, say.
    return { trouble: "The server's answer could not be read." };
  }
}

try {
  const [entry] = await Promise.all([readEntry(), loadScoreFonts()]);

  if ("trouble" in entry) {
    showTrouble(entry.trouble);
  } else {
    createApp(
      {
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
        video: required("video"),
        playbackControls: required("playback-controls"),
        scoreArea: required("score-area"),
      },
      entry,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  document.getElementById("status")!.textContent = message;
  console.error(error);
}
