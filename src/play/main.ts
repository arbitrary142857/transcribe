/**
 * The way into a puzzle.
 *
 * Everything is fetched before the page is built at all: `createPlayPage`
 * mounts synchronously, and a level — or a half-finished attempt at one —
 * arriving afterwards would reach a page already drawn without it. That is
 * also why the progress store is asynchronous although local storage is not;
 * the day it is a table, this line does not change.
 */

import { createLocalProgressStore, type PlayProgress } from "../puzzle/progress.js";
import {
  isTranscriptionId,
  type TranscriptionRecord,
} from "../shared/transcription.js";
import {
  fetchLevel,
  loadScoreFonts,
  required,
  showTrouble,
} from "../ui/page-boot.js";
import { createPlayPage } from "../ui/play-page.js";

const store = createLocalProgressStore(window.localStorage);

/**
 * The level named in the address, if one is.
 *
 * The id is checked before it is sent. Every query binds its values, so a
 * strange one could do no harm, but there is nothing to look up and so nothing
 * is looked up.
 */
async function readLevel(): Promise<
  { id: string; record: TranscriptionRecord } | { trouble: string }
> {
  const asked = new URLSearchParams(window.location.search).get("level");
  if (asked === null || !isTranscriptionId(asked)) {
    return { trouble: "That address does not name a level." };
  }

  // `/puzzle`, never `/source`: the second is the editor's door and hands over
  // the answer. This one has had every pitch but the first taken out of it
  // before it left the server.
  const record = await fetchLevel<TranscriptionRecord>(
    `/api/levels/${asked}/puzzle`,
  );
  return "trouble" in record ? record : { id: asked, record };
}

/** What a previous visit left, for the level actually being opened. */
async function readProgress(): Promise<PlayProgress | undefined> {
  const asked = new URLSearchParams(window.location.search).get("level");
  return asked !== null && isTranscriptionId(asked)
    ? store.read(asked)
    : undefined;
}

try {
  const [level, progress] = await Promise.all([
    readLevel(),
    readProgress(),
    loadScoreFonts(),
  ]);

  if ("trouble" in level) {
    showTrouble(required("trouble"), level.trouble);
    required("toolbar").hidden = true;
    required("keyboard-area").hidden = true;
  } else {
    required("toolbar").hidden = false;
    required("keyboard-area").hidden = false;
    createPlayPage(
      {
        bar: required("play-bar"),
        score: required("score"),
        durations: required("durations"),
        tuplets: required("tuplets"),
        actions: required("actions"),
        pitchActions: required("pitch-actions"),
        status: required("status"),
        keyboard: required("keyboard"),
        video: required("video"),
        playbackControls: required("playback-controls"),
        scoreArea: required("score-area"),
      },
      level,
      store,
      progress,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  document.getElementById("status")!.textContent = message;
  console.error(error);
}
