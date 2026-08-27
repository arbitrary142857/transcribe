import {
  isTranscriptionId,
  type TranscriptionRecord,
} from "../shared/transcription.js";
import { clearDraft, readDraft } from "../ui/draft-stash.js";
import { createEditorPage, type Entry } from "../ui/editor-page.js";
import {
  fetchLevel,
  loadScoreFonts,
  required,
  showTrouble,
  type Trouble,
} from "../ui/page-boot.js";
import { mountSiteNav } from "../ui/site-nav.js";

/**
 * How this page was arrived at.
 *
 * Without a level in the address it is a fresh transcription and the setup
 * page asks for everything. With one, the whole record is fetched before the
 * editor is built at all — `createEditorPage` mounts synchronously, and a
 * melody that turned up afterwards would arrive to a page already showing
 * setup.
 *
 * Unless there is a stash. Work that was put aside on the way to signing in
 * belongs to one address — `/edit` for a transcription that never had one,
 * `/edit?level=…` for a draft that did — and is taken up only there, and
 * cleared the moment it is taken: it is a hand-off across a sign-in, not a
 * place work lives. For a draft it is also newer than the row, so the row is
 * not fetched at all.
 *
 * The id is checked before it is sent. Every query binds its values, so a
 * strange one could do no harm, but there is nothing to look up and so nothing
 * is looked up.
 */
async function readEntry(): Promise<Entry | Trouble> {
  const asked = new URLSearchParams(window.location.search).get("level");
  const draft = readDraft(window.localStorage);

  if (asked === null) {
    if (draft !== undefined && draft.levelId === undefined) {
      clearDraft(window.localStorage);
      return { kind: "restore", draft };
    }
    return { kind: "new" };
  }
  if (!isTranscriptionId(asked)) {
    return { trouble: "That address does not name a level." };
  }
  if (draft !== undefined && draft.levelId === asked) {
    clearDraft(window.localStorage);
    return { kind: "restore", draft };
  }

  const record = await fetchLevel<TranscriptionRecord>(
    `/api/levels/${asked}/source`,
  );
  return "trouble" in record
    ? record
    : { kind: "edit", id: asked, record };
}

try {
  const nav = mountSiteNav(required("site-nav"));

  const [entry] = await Promise.all([readEntry(), loadScoreFonts()]);

  if ("trouble" in entry) {
    // A level that is somebody's, with nobody signed in: the remedy is offered
    // beside the sentence, and it comes back to this very address.
    showTrouble(required("setup"), entry.trouble, {
      signIn: entry.signIn
        ? `${window.location.pathname}${window.location.search}`
        : undefined,
    });
  } else {
    createEditorPage(
      {
        setup: required("setup"),
        workspace: required("workspace"),
        sheetHead: required("sheet-head"),
        score: required("score"),
        durations: required("durations"),
        tuplets: required("tuplets"),
        actions: required("actions"),
        controls: required("controls"),
        pitchActions: required("pitch-actions"),
        keyboard: required("keyboard"),
        sheet: required("score-scroll"),
        toolbar: required("toolbar"),
        keyboardArea: required("keyboard-area"),
        sidePanel: required("side-panel"),
        sideTools: required("side-tools"),
        panelActions: required("panel-actions"),
        panelSubmit: required("panel-submit"),
        pitchHistory: required("pitch-history"),
        video: required("video"),
        playbackControls: required("playback-controls"),
        scoreArea: required("score-area"),
      },
      entry,
      nav,
    );
  }
} catch (error) {
  // The page never got as far as having a panel to report into, so this goes
  // where the setup page would have been.
  const message = error instanceof Error ? error.message : String(error);
  showTrouble(required("setup"), message);
  console.error(error);
}
