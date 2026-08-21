import {
  isTranscriptionId,
  type TranscriptionRecord,
} from "../shared/transcription.js";
import { createEditorPage, type Entry } from "../ui/editor-page.js";
import {
  fetchLevel,
  loadScoreFonts,
  required,
  showTrouble,
} from "../ui/page-boot.js";
import { mountSessionNav } from "../ui/session-nav.js";

/**
 * How this page was arrived at.
 *
 * Without a level in the address it is a fresh transcription and the setup
 * page asks for everything. With one, the whole record is fetched before the
 * editor is built at all — `createEditorPage` mounts synchronously, and a
 * melody that turned up afterwards would arrive to a page already showing
 * setup.
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

  const record = await fetchLevel<TranscriptionRecord>(
    `/api/levels/${asked}/source`,
  );
  return "trouble" in record
    ? record
    : { kind: "edit", id: asked, record };
}

try {
  mountSessionNav(required("session-nav"));

  const [entry] = await Promise.all([readEntry(), loadScoreFonts()]);

  if ("trouble" in entry) {
    showTrouble(required("setup"), entry.trouble);
  } else {
    createEditorPage(
      {
        setup: required("setup"),
        workspace: required("workspace"),
        signatures: required("signatures"),
        score: required("score"),
        durations: required("durations"),
        tuplets: required("tuplets"),
        actions: required("actions"),
        controls: required("controls"),
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
