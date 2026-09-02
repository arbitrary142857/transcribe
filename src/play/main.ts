/**
 * The way into a puzzle.
 *
 * Everything is fetched before the page is built at all: `createPlayPage`
 * mounts synchronously, and a level — or a half-finished attempt at one —
 * arriving afterwards would reach a page already drawn without it. The
 * progress store was made asynchronous for this day, when it is a table for
 * whoever is signed in; the line that hands the record over did not change.
 *
 * Who is looking decides where the record is read from, so the nav's answer
 * comes first — and, for an account new to this machine with records to
 * offer, the question about them is settled before the record is read, so a
 * record just brought in is the one the puzzle opens with.
 */

import { progressStoreFor } from "../puzzle/account-progress.js";
import {
  createLocalProgressStore,
  type PlayProgress,
  type ProgressStore,
} from "../puzzle/progress.js";
import type { UserSummary } from "../shared/session.js";
import {
  isTranscriptionId,
  type TranscriptionRecord,
} from "../shared/transcription.js";
import { offerMergeOnArrival } from "../ui/merge-offer.js";
import {
  browserFetch,
  fetchLevel,
  loadScoreFonts,
  required,
  showTrouble,
} from "../ui/page-boot.js";
import { createPlayPage } from "../ui/play-page.js";
import { mountSiteNav } from "../ui/site-nav.js";

const local = createLocalProgressStore(window.localStorage);

/**
 * The level named in the address, if one is.
 *
 * The id is checked before it is sent. Every query binds its values, so a
 * strange one could do no harm, but there is nothing to look up and so nothing
 * is looked up.
 */
function askedLevelId(): string | undefined {
  const asked = new URLSearchParams(window.location.search).get("tune");
  return asked !== null && isTranscriptionId(asked) ? asked : undefined;
}

async function readLevel(): Promise<
  { id: string; record: TranscriptionRecord } | { trouble: string }
> {
  const asked = askedLevelId();
  if (asked === undefined) {
    return { trouble: "That address does not name a tune." };
  }

  // `/puzzle`, never `/source`: the second is the editor's door and hands over
  // the answer. This one has had every pitch but the first taken out of it
  // before it left the server.
  const record = await fetchLevel<TranscriptionRecord>(
    `/api/tunes/${asked}/puzzle`,
  );
  return "trouble" in record ? record : { id: asked, record };
}

/**
 * Who is looking, whether this browser has anything to hand them, and then —
 * only then — what was left on this level, from wherever their progress is
 * kept.
 */
async function readProgress(
  viewer: Promise<UserSummary | undefined>,
): Promise<{
  store: ProgressStore;
  restored: PlayProgress | undefined;
  /** Who is looking, for the page's rating prompt to size them up. */
  user: UserSummary | undefined;
}> {
  const user = await viewer;
  const trouble = await offerMergeOnArrival({
    user,
    storage: window.localStorage,
    local,
    fetch: browserFetch,
  });
  // The records are still in this browser, and the front page offers them
  // again; this page has nowhere to say so.
  if (trouble !== undefined) console.error(trouble);

  const store = progressStoreFor(user, { fetch: browserFetch, local });
  const asked = askedLevelId();
  return {
    store,
    restored: asked === undefined ? undefined : await store.read(asked),
    user,
  };
}

try {
  const { viewer } = mountSiteNav(required("site-nav"));

  const [level, { store, restored, user }] = await Promise.all([
    readLevel(),
    readProgress(viewer),
    loadScoreFonts(),
  ]);

  if ("trouble" in level) {
    showTrouble(required("trouble"), level.trouble);
    required("toolbar").hidden = true;
    required("keyboard-area").hidden = true;
    required("side-panel").hidden = true;
  } else {
    // The band stays away: nothing that writes a rhythm is drawn here, and it
    // holds nothing else any more.
    required("keyboard-area").hidden = false;
    required("side-panel").hidden = false;
    // The working frame: the page stops scrolling and the score's box takes
    // over, under the nav that stays where it is on every page.
    document.body.classList.add("is-framed");
    createPlayPage(
      {
        sheetHead: required("sheet-head"),
        sideTools: required("side-tools"),
        panelActions: required("panel-actions"),
        panelSubmit: required("panel-submit"),
        pitchHistory: required("pitch-history"),
        score: required("score"),
        durations: required("durations"),
        tuplets: required("tuplets"),
        actions: required("actions"),
        pitchActions: required("pitch-actions"),
        keyboard: required("keyboard"),
        sheet: required("score-scroll"),
        video: required("video"),
        playbackControls: required("playback-controls"),
        scoreArea: required("score-area"),
      },
      level,
      store,
      restored,
      user,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  showTrouble(required("trouble"), message);
  console.error(error);
}
