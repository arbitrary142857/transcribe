import { decode, encode } from "../editor/codec.js";
import { createHistory, type History } from "../editor/history.js";
import { emptyMelody } from "../editor/operations.js";
import { withKeySignature } from "../editor/signature.js";
import { KeySignature } from "../music/key-signature.js";
import type { Melody } from "../music/melody.js";
import { Pitch } from "../music/pitch.js";
import type { TimeSignature } from "../music/types.js";
import { beatsPerBarOf, type Marks } from "../playback/tempo-map.js";
import { timingProblem } from "../playback/timing-fields.js";
import {
  countSoundingNotes,
  detailsProblem,
  isTranscriptionId,
  LIMITS,
  type Clef,
  type TranscriptionDetails,
  type TranscriptionRecord,
} from "../shared/transcription.js";
import { writeDraft, type Draft } from "./draft-stash.js";
import { createEditor, type Editor, type EditorElements } from "./editor.js";
import { googleButton } from "./google-button.js";
import { openChoiceModal } from "./modal.js";
import { keepingScroll } from "./score-overlay.js";
import { createPlayback, type Playback } from "./playback.js";
import { createSetupPage, type Setup } from "./setup-panel.js";
import { createHistoryPair, type HistoryPair } from "./history-pair.js";
import { createPanelActions, type PanelActions } from "./panel-actions.js";
import { createSheetHead, type SheetHead } from "./sheet-head.js";
import { createSideTools, type SideTools } from "./side-tools.js";
import { ANONYMOUS } from "../shared/session.js";
import type { SiteNav } from "./site-nav.js";
import { isTypingTarget } from "./typing-guard.js";
import { mountVideoPanel } from "./video-panel.js";

export type EditorPageElements = EditorElements & {
  /** The masthead over the score: the title, the subtitle and the byline. */
  sheetHead: HTMLElement;
  setup: HTMLElement;
  workspace: HTMLElement;
  toolbar: HTMLElement;
  keyboardArea: HTMLElement;
  /** The column down the window's right-hand side that holds the video. */
  sidePanel: HTMLElement;
  /** The note in that column's corner about the keyboard shortcuts. */
  sideTools: HTMLElement;
  /** Key and Details, above the playback shell. */
  panelActions: HTMLElement;
  /** Save and its message, under the video. */
  panelSubmit: HTMLElement;
  /** Undo and redo, in the keyboard band under Clear pitch. */
  pitchHistory: HTMLElement;
  video: HTMLElement;
  playbackControls: HTMLElement;
  scoreArea: HTMLElement;
};

/**
 * How the page was arrived at.
 *
 * A fresh transcription starts at the setup page; one opened from the level
 * list starts already written, with nothing left to settle; and one restored
 * from the stash — work somebody was in the middle of when they went to sign
 * in — starts written too, but unsaved, and saves itself the moment it can.
 *
 * There was a `mode` here once, waiting for the day playing a level and
 * editing one became two different doors. They now are — `/play` is its own
 * page with its own controller — so the field went with the guess it was
 * standing in for.
 */
export type Entry =
  | { kind: "new" }
  | { kind: "edit"; id: string; record: TranscriptionRecord }
  | { kind: "restore"; draft: Draft };

/** What the melody was written down from, kept because saving needs it. */
type Source = {
  videoId: string;
  marks: Marks;
  measures: number;
  meter: TimeSignature;
};

/** The key a new melody starts in, until it is changed. */
const OPENING_KEY = new KeySignature(new Pitch("C", 0, 4), "major");

const EMPTY_DETAILS: TranscriptionDetails = {
  title: "",
  subtitle: "",
  instructions: "",
  // The middle of the scale from the first moment, so a level is never
  // saved unrated and publishing never has to refuse for it. The author
  // adjusts it in the details panel; the stepper cannot say "none".
  difficulty: 2.5,
};

/**
 * Hold the melody and the controls around it.
 *
 * The page has two lives. Before there is a melody it asks for the clef, the
 * meter and the video: neither of the first two can be changed once music
 * depends on them, and the third is what the music is being written down from.
 * Afterwards it never mentions the clef or the meter again — they are printed
 * on the stave, which is a better place to read them from than a control that
 * cannot be used — while the video stays in the band above the music, where it
 * is wanted for as long as there is anything left to write.
 *
 * Opening a saved transcription skips the first life entirely. Everything the
 * setup page would have settled is already settled, so `mount()` finds a melody
 * waiting and the setup page is never built at all. So does restoring one
 * from the stash.
 *
 * Saving stays on the page. The first save of a new transcription gives it an
 * address, which the page takes on without leaving, so that a reload resumes
 * the same draft; every save after is an edit of it. Publishing is done from
 * the author's own list, not from here.
 *
 * `nav` knows who is signed in, and Save asks it first, because a
 * transcription is saved to an account: with nobody signed in, the work is
 * stashed on this machine and the page goes to sign in, to come back here and
 * save. The nav's own sign-in is given the same stash to write on its way
 * out, so signing in from the corner loses nothing either — though that one
 * only puts the work back, and leaves saving to the visitor.
 */
export function createEditorPage(
  elements: EditorPageElements,
  entry: Entry,
  nav: SiteNav,
): void {
  const { viewer } = nav;
  let melody: Melody | undefined;
  let clef: Clef = "treble";
  let pitchOnly = false;
  /**
   * Whether the piano sounds as pitches are set.
   *
   * Off at the start of every transcription, and deliberately not remembered
   * across them: it is a way of working on one piece rather than a preference,
   * and a page that started making noise because of something done last week
   * would be a surprise. Held here rather than in the editor because `mount`
   * rebuilds that from nothing on every undo, rhythm switch and key change.
   */
  let sound = false;
  let editor: Editor | undefined;
  let history: History | undefined;
  let playback: Playback | undefined;
  let actions: PanelActions | undefined;
  let head: SheetHead | undefined;
  let tools: SideTools | undefined;
  let steps: HistoryPair | undefined;
  let source: Source | undefined;

  let details: TranscriptionDetails = { ...EMPTY_DETAILS };
  let saving = false;
  /**
   * What went wrong sending it, until the next attempt clears it.
   *
   * Held rather than written straight to the page because the panel's one
   * message line has two other things to say — why Save is grey, and nothing
   * at all — and a line written from two places would have them overwrite each
   * other in whichever order they happened to run.
   */
  let trouble: string | undefined;

  /**
   * Whose name goes on the sheet, once /api/me has said.
   *
   * The account's, not the level's: only its author can open a transcription
   * here, so the two are the same — and a transcription that has never been
   * saved has no author but the person writing it. Nobody signed in means no
   * line at all rather than a blank one; an account that has asked to be
   * anonymous is credited as such, and so is one old enough to have no name,
   * because an email address does not belong on the front of a score.
   */
  let credit: string | undefined;
  void viewer.then((user) => {
    if (user === undefined) return;
    credit = user.anonymousAuthor ? ANONYMOUS : (user.username ?? ANONYMOUS);
    showSignatures();
  });

  /**
   * The address this transcription has in the database, once it has one. A
   * new transcription gets it from its first save; an opened or restored one
   * arrives with it. Absent, Save creates; present, Save edits.
   */
  let levelId: string | undefined =
    entry.kind === "edit"
      ? entry.id
      : entry.kind === "restore"
        ? entry.draft.levelId
        : undefined;

  /**
   * The page is about to be left on purpose — for the sign-in — with the work
   * stashed. The browser's question about unsaved work is not asked then; it
   * would be asked about work that is safe.
   */
  let leaving = false;

  /**
   * The melody and the details as they last stood in the database, or as they
   * started for something never saved.
   *
   * Compared rather than counted: `history.canUndo()` would miss an edit that
   * only changed the title, and a title is a perfectly ordinary thing to come
   * back and fix.
   */
  let savedMelody = "";
  let savedDetails = JSON.stringify(EMPTY_DETAILS);
  let savedMarks = "";

  const detailsNow = () => JSON.stringify(details);
  const melodyNow = () => (melody ? JSON.stringify(encode(melody)) : "");
  const marksNow = () => (source ? JSON.stringify(source.marks) : "");

  type Snapshot = { melody: string; details: string; marks: string };
  const snapshot = (): Snapshot => ({
    melody: melodyNow(),
    details: detailsNow(),
    marks: marksNow(),
  });

  const isDirty = () =>
    melodyNow() !== savedMelody ||
    detailsNow() !== savedDetails ||
    marksNow() !== savedMarks;

  /**
   * Nothing is owed: what is on the page is what is in the database. Only
   * once there is a database row to be the same as — a fresh, empty page is
   * clean, but it is not saved.
   */
  const isSaved = () => levelId !== undefined && !isDirty();

  /**
   * What went into the database, or what the page opened as.
   *
   * Given a snapshot when it is the former: the one taken before the request
   * left, so a note written while the request was out is still owed rather
   * than quietly counted as saved.
   */
  function markSaved(sent: Snapshot = snapshot()): void {
    savedMelody = sent.melody;
    savedDetails = sent.details;
    savedMarks = sent.marks;
  }

  function showSetup(): void {
    elements.workspace.hidden = true;
    elements.toolbar.hidden = true;
    elements.keyboardArea.hidden = true;
    elements.sidePanel.hidden = true;
    // Setup is an ordinary scrolling page with the nav in view; the frame —
    // and the rolled-up nav — belong to the editor proper.
    document.body.classList.remove("is-framed");
    elements.setup.hidden = false;
    // Built once; the page manages its own regions from then on, and tears
    // itself down before handing over.
    createSetupPage(elements.setup, { onStart: start });
  }

  /** Put the video and its controls on, once, for whichever life this is. */
  function openVideo(from: Source): void {
    // Put on once and then left alone. Every edit rebuilds the controls around
    // the player, and rebuilding the player itself would send the video back to
    // its beginning each time — so the thing that drives it is made out here
    // too, beside it and outside the editor's life. Without YouTube's control
    // bar, because the page opens in playback mode, where the panel drives it.
    const iframe = mountVideoPanel(elements.video, from.videoId, {
      controls: false,
    });
    playback = createPlayback(
      { panel: elements.playbackControls, scoreArea: elements.scoreArea },
      iframe,
      { marks: from.marks, measures: from.measures, meter: from.meter },
      () => editor?.selection(),
      {
        // The marks were first guessed on the setup page against a video
        // nobody had transcribed yet, so correcting them belongs here. Playing
        // a level will pass false: there the marks are part of the level.
        canRetime: true,
        onRetime(marks) {
          if (!source) return;
          source = { ...source, marks };
          showSignatures();
        },
        // The mode switch trades the embed for the other kind — the control
        // bar is a parameter of the embed — and puts the position back itself.
        remountVideo: (embedOptions) =>
          mountVideoPanel(elements.video, from.videoId, embedOptions),
      },
    );
  }

  function start(setup: Setup): void {
    clef = setup.clef === "bass" ? "bass" : "treble";
    source = {
      videoId: setup.videoId,
      marks: setup.marks,
      measures: setup.measures,
      meter: setup.meter,
    };
    // This is a fresh embed: the one on the setup page died with that page, and
    // a seek into the marked section is how playback starts anyway.
    openVideo(source);
    // The melody arrives at its full, final length: every bar the marks span,
    // as rests, waiting to be written into. No edit can add or remove one.
    melody = emptyMelody(OPENING_KEY, setup.meter, setup.measures);
    history = createHistory(melody);
    // Nothing has been saved, so the baseline is what it opened as: an empty
    // page is not unsaved work, and leaving it should not be argued about.
    markSaved();
    mount();
  }

  /** Open a transcription that already exists, with nothing left to settle. */
  function open(record: TranscriptionRecord): void {
    clef = record.clef;
    source = {
      videoId: record.videoId,
      marks: { start: record.markStart, end: record.markEnd },
      measures: record.measures,
      meter: record.meter,
    };
    openVideo(source);
    melody = decode(record.melody);
    history = createHistory(melody);
    details = {
      title: record.title,
      subtitle: record.subtitle ?? "",
      instructions: record.instructions ?? "",
      // A draft from before difficulty was defaulted opens at the middle,
      // and its next save carries it: the quiet backfill for local drafts.
      difficulty: record.authorDifficulty ?? 2.5,
    };
    markSaved();
    mount();
  }

  /**
   * Take up work that was stashed on the way to signing in.
   *
   * Like `open`, everything the setup page would settle is settled; unlike
   * it, nothing has been saved — the baselines are left where a fresh page
   * starts them, so the button reads Save rather than Saved. And the moment
   * the nav corner says somebody is signed in, it is pressed: the visitor
   * left to sign in so that this could be saved, and it should not be waited
   * for twice.
   */
  function restore(draft: Draft): void {
    clef = draft.setup.clef;
    source = {
      videoId: draft.setup.videoId,
      marks: draft.setup.marks,
      measures: draft.setup.measures,
      meter: draft.setup.meter,
    };
    openVideo(source);
    try {
      melody = decode(draft.melody);
    } catch (error) {
      // The stash passed every shape check and still is not a melody. Nothing
      // to do but say so and start over; the setup page is what "over" is.
      console.error(error);
      trouble = "The work kept on this device could not be read.";
      mount();
      return;
    }
    history = createHistory(melody);
    details = {
      title: draft.details.title,
      subtitle: draft.details.subtitle ?? "",
      instructions: draft.details.instructions ?? "",
      difficulty: draft.details.difficulty ?? 2.5,
    };
    mount();
    // Only when Save is what the visitor pressed: a sign-in from the corner
    // put the work aside, and puts it back, and asks nothing more of it.
    if (draft.intent === "save") {
      void viewer.then((user) => {
        if (user !== undefined) void save();
      });
    }
  }

  /** Why the transcription cannot be saved, or nothing if it can. */
  function saveProblem(): string | undefined {
    if (!melody || !source) return "There is nothing to save yet.";
    if (countSoundingNotes(melody) < LIMITS.noteCount.min) {
      return "Write at least two notes before saving.";
    }
    // The marks can now be moved from here, so they can now be moved wrong:
    // the same gate the setup page holds its Start button to.
    const timing = timingProblem(
      {
        start: source.marks.start,
        end: source.marks.end,
        measures: source.measures,
        locked: false,
      },
      beatsPerBarOf(source.meter),
    );
    if (timing !== undefined) return timing;
    return detailsProblem(details);
  }

  /** Draw everything that is not the score: the masthead and the panel. */
  function showSignatures(): void {
    if (!melody || !history || !actions || !head || !steps || !tools) return;
    tools.update({ showRhythm: !pitchOnly });
    steps.update({
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
    });
    head.update({
      title: details.title,
      subtitle: details.subtitle,
      credit,
    });
    // Compared rather than counted: `isDirty` puts the melody, the words and
    // the marks against what was last saved, so writing a note and writing it
    // back leaves the button at Saved. That works because the encoding is
    // canonical — ties come out in index order and brackets are sorted —
    // which the undo stack already relies on.
    const saved = isSaved();
    const problem = saveProblem();
    actions.update({
      submit: {
        label: saving ? "Saving…" : saved ? "Saved" : "Save",
        disabled: saving || saved || problem !== undefined,
      },
      // What went wrong sending it outranks why the next one cannot go: the
      // first is news, the second is a standing fact about an empty title.
      // Neither is worth saying while it is going, or once it has gone.
      message: saving || saved ? "" : (trouble ?? problem ?? ""),
      key: melody.keySignature,
      clef,
      details,
    });
  }

  /**
   * Put what is on the page into the database.
   *
   * Asks who is signed in before asking the server, because the answer
   * decides which of two things happens: a save, or a trip to sign in with
   * the work stashed. The server's 401 is the same trip, for a session that
   * ran out under the page.
   */
  async function save(): Promise<void> {
    if (!melody || !source || saving || isSaved()) return;
    if (saveProblem() !== undefined) return;
    saving = true;
    trouble = undefined;
    showSignatures();

    try {
      const user = await viewer;
      if (user === undefined) {
        saving = false;
        showSignatures();
        await offerSignIn();
        return;
      }

      // Taken before the request leaves, so a note written while it is out
      // stays owed.
      const sent = snapshot();
      const body =
        levelId === undefined
          ? {
              details,
              melody: encode(melody),
              videoId: source.videoId,
              markStart: source.marks.start,
              markEnd: source.marks.end,
              clef,
            }
          : {
              details,
              melody: encode(melody),
              markStart: source.marks.start,
              markEnd: source.marks.end,
            };

      const response = await fetch(
        levelId === undefined ? "/api/levels" : `/api/levels/${levelId}`,
        {
          method: levelId === undefined ? "POST" : "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 401) {
        saving = false;
        showSignatures();
        await offerSignIn();
        return;
      }
      if (!response.ok) {
        const said = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(said.error ?? `The server answered ${response.status}.`);
      }

      if (levelId === undefined) {
        // A new transcription has an address now. The page takes it on
        // without leaving, so a reload resumes this draft; `replaceState`
        // rather than `pushState`, so Back still leaves the page rather than
        // returning to a setup page that no longer exists.
        const { id } = (await response.json()) as { id?: unknown };
        if (!isTranscriptionId(id)) {
          throw new Error("The server's answer could not be read.");
        }
        levelId = id;
        window.history.replaceState(null, "", `/edit?level=${id}`);
      }
      markSaved(sent);
    } catch (error) {
      trouble =
        error instanceof Error
          ? `It could not be saved. ${error.message}`
          : "It could not be saved.";
      console.error(error);
    } finally {
      saving = false;
      showSignatures();
    }
  }

  /** Where a sign-in should come back to: this draft, or a fresh page for one. */
  const here = () =>
    levelId === undefined ? "/edit" : `/edit?level=${levelId}`;

  /**
   * Put the work aside for a sign-in, and say whether it was put.
   *
   * Written before the page is left, and the page is left only if it was
   * written: a browser that refuses its storage is told so, and keeps the
   * work on the screen where it is. With no melody yet there is nothing to
   * put aside, and the page may simply be left.
   */
  function stash(intent: Draft["intent"]): boolean {
    if (!melody || !source) return true;
    const kept = writeDraft(window.localStorage, {
      melody: encode(melody),
      details,
      setup: {
        clef,
        meter: source.meter,
        videoId: source.videoId,
        marks: source.marks,
        measures: source.measures,
      },
      ...(levelId === undefined ? {} : { levelId }),
      intent,
      at: Date.now(),
    });
    if (!kept) {
      trouble =
        "This browser would not keep the work while you sign in. Sign in from another tab, then save here.";
      showSignatures();
      return false;
    }
    leaving = true;
    return true;
  }

  // Neither of these changes again, so neither waits for a melody: the note
  // is a static line, and the hook is the nav's.
  tools = createSideTools(elements.sideTools, {
    onRhythm: (show) => {
      pitchOnly = !show;
      mount();
    },
  });

  // The corner's sign-in puts the work aside too, and only aside: on the way
  // back it is restored, not saved.
  nav.beforeSignIn(() => stash("keep"));

  /**
   * Nobody is signed in, and saving needs somebody.
   *
   * A box with the way in drawn as Google asks, and the way back. The link
   * stashes the work as it is followed, marked as work to be saved on return.
   */
  async function offerSignIn(): Promise<void> {
    await openChoiceModal({
      title: "Sign in to save",
      body: [
        "Transcriptions are saved to an account, and nobody is signed in.",
        "Your work is kept on this device while you sign in, and saved the moment you are back.",
      ],
      cancel: "Not now",
      choice: () => googleButton({ next: here(), beforeGo: () => stash("save") }),
    });
  }

  function mount(): void {
    if (!melody) {
      showSetup();
      return;
    }
    // The same collapse the play page guards against: undo, redo, a key change
    // and the mode switch all rebuild the score from nothing.
    keepingScroll(rebuild);
  }

  function rebuild(): void {
    if (!melody) return;
    elements.setup.hidden = true;
    elements.setup.replaceChildren();
    elements.workspace.hidden = false;
    // Nothing but the rhythm controls is left in the band, so with those away
    // it is an empty strip: it goes, and the score takes the height.
    elements.toolbar.hidden = pitchOnly;
    elements.keyboardArea.hidden = false;
    elements.sidePanel.hidden = false;
    document.body.classList.add("is-framed");

    // All built the first time there is a melody and mutated from then on.
    // Every one of them outlives an edit: the details box holds boxes somebody
    // may be typing into, the switch keeps its own idea of which way it is
    // thrown, and the chips grey and ungrey on every edit — any of them
    // redrawn that often would take the caret or the focus ring with it.
    actions ??= createPanelActions(
      { boxes: elements.panelActions, submit: elements.panelSubmit },
      {
        onSubmit: () => void save(),
        onKey: changeKey,
        onDetails: (next) => {
          details = next;
          showSignatures();
        },
      },
    );
    head ??= createSheetHead(elements.sheetHead);
    steps ??= createHistoryPair(elements.pitchHistory, {
      onUndo: () => step(history?.undo()),
      onRedo: () => step(history?.redo()),
    });

    // The person mid-edit has not moved, so their selection must not: undo,
    // redo, key changes and mode switches all pass through here, and each
    // rebuilds the editor from nothing.
    const selected = editor?.selection();
    editor?.destroy();
    showSignatures();
    // Told before the editor draws, so the first score it hands over is read
    // against the melody it belongs to rather than the one before it.
    playback?.follow(melody);
    editor = createEditor(melody, elements, {
      clef,
      pitchOnly,
      sound,
      onSound: (next) => {
        sound = next;
      },
      initialSelection: selected,
      onEdit: () => {
        if (!melody) return;
        history?.record(melody);
        // The bar count cannot change, but where each note sits inside it can.
        playback?.follow(melody);
        showSignatures();
      },
      onRender: (rendered) => playback?.onScore(rendered),
      onSelect: (index) => playback?.onSelect(index),
    });
  }

  /** Take on a melody that arrived whole, from undo, redo or a key change. */
  function step(next: Melody | undefined): void {
    if (!next) return;
    melody = next;
    mount();
  }

  function changeKey(key: KeySignature): void {
    if (!melody || key.isEqual(melody.keySignature)) return;
    melody = withKeySignature(melody, key);
    history?.record(melody);
    mount();
  }

  /**
   * Undo and redo, on the keys every editor uses for them.
   *
   * Held here rather than in the editor because both replace the melody
   * outright, which is the one thing the editor cannot do to itself.
   */
  window.addEventListener("keydown", (event) => {
    // Cmd+Z inside a text field undoes the field's own typing, not the melody.
    if (isTypingTarget(event)) {
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") {
      // Ctrl+Y is the other half of the Windows pairing.
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        step(history?.redo());
      }
      return;
    }
    event.preventDefault();
    step(event.shiftKey ? history?.redo() : history?.undo());
  });

  /**
   * The browser's own question before unsaved work is thrown away.
   *
   * Asked here rather than on the link in the bar above because that is only
   * one of the ways out: this one also catches the back button, a reload, and
   * the tab being closed.
   *
   * What counts as unsaved is the melody *or* the words — a title typed and
   * not sent is as much work as a note written and not sent.
   *
   * Not asked on the way to sign in: the work is in the stash by then, and a
   * question about losing it would be wrong. If the visitor comes straight
   * back — the back button, with the page restored from the browser's cache
   * — the question is armed again, since the stash may since have been spent.
   */
  window.addEventListener("beforeunload", (event) => {
    if (leaving || !isDirty()) return;
    event.preventDefault();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) leaving = false;
  });

  switch (entry.kind) {
    case "edit":
      open(entry.record);
      break;
    case "restore":
      restore(entry.draft);
      break;
    case "new":
      mount();
      break;
  }
}
