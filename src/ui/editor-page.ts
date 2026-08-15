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
  LIMITS,
  type Clef,
  type TranscriptionDetails,
  type TranscriptionRecord,
} from "../shared/transcription.js";
import { createEditor, type Editor, type EditorElements } from "./editor.js";
import { keepingScroll } from "./score-overlay.js";
import { createPlayback, type Playback } from "./playback.js";
import { createSetupPage, type Setup } from "./setup-panel.js";
import { createSignatureBar, type SignatureBar } from "./signature-bar.js";
import { isTypingTarget } from "./typing-guard.js";
import { mountVideoPanel } from "./video-panel.js";

export type EditorPageElements = EditorElements & {
  signatures: HTMLElement;
  setup: HTMLElement;
  workspace: HTMLElement;
  toolbar: HTMLElement;
  keyboardArea: HTMLElement;
  video: HTMLElement;
  playbackControls: HTMLElement;
  scoreArea: HTMLElement;
};

/**
 * How the page was arrived at.
 *
 * A fresh transcription starts at the setup page; one opened from the level
 * list starts already written, with nothing left to settle.
 *
 * There was a `mode` here once, waiting for the day playing a level and
 * editing one became two different doors. They now are — `/play` is its own
 * page with its own controller — so the field went with the guess it was
 * standing in for.
 */
export type Entry =
  | { kind: "new" }
  | { kind: "edit"; id: string; record: TranscriptionRecord };

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
 * waiting and the setup page is never built at all.
 */
export function createEditorPage(
  elements: EditorPageElements,
  entry: Entry = { kind: "new" },
): void {
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
   * rebuilds that from nothing on every undo, mode switch and key change.
   */
  let sound = false;
  let editor: Editor | undefined;
  let history: History | undefined;
  let playback: Playback | undefined;
  let bar: SignatureBar | undefined;
  let source: Source | undefined;

  let details: TranscriptionDetails = { ...EMPTY_DETAILS };
  let saving = false;

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

  const isDirty = () =>
    melodyNow() !== savedMelody ||
    detailsNow() !== savedDetails ||
    marksNow() !== savedMarks;

  /** Everything just went into the database; nothing is owed on the way out. */
  function markSaved(): void {
    savedMelody = melodyNow();
    savedDetails = detailsNow();
    savedMarks = marksNow();
  }

  function showSetup(): void {
    elements.workspace.hidden = true;
    elements.toolbar.hidden = true;
    elements.keyboardArea.hidden = true;
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
    // too, beside it and outside the editor's life.
    const iframe = mountVideoPanel(elements.video, from.videoId);
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
    };
    markSaved();
    mount();
  }

  /** Why the transcription cannot be sent, or nothing if it can. */
  function submitProblem(): string | undefined {
    if (!melody || !source) return "There is nothing to send yet.";
    if (countSoundingNotes(melody) < LIMITS.noteCount.min) {
      return "Write at least two notes before submitting.";
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
    const wrong = detailsProblem(details);
    if (wrong !== undefined) return wrong;

    // Last, so a transcription that is unsendable for a real reason says the
    // real reason rather than this one.
    //
    // Compared rather than counted: `isDirty` puts the melody, the words and
    // the marks against what was last saved, so writing a note and writing it
    // back leaves nothing to send and the button goes grey again. That works
    // because the encoding is canonical — ties come out in index order and
    // brackets are sorted — which the undo stack already relies on.
    return isDirty() ? undefined : "Nothing has changed yet.";
  }

  function showSignatures(): void {
    if (!melody || !history || !bar) return;
    bar.update({
      key: melody.keySignature,
      clef,
      pitchOnly,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      details,
      submitLabel: entry.kind === "edit" ? "Save changes" : "Submit",
      submitProblem: submitProblem(),
      saving,
    });
  }

  async function submit(): Promise<void> {
    if (!melody || !source || saving || submitProblem() !== undefined) return;
    saving = true;
    showSignatures();
    elements.status.textContent = "";

    const editing = entry.kind === "edit";
    const body = editing
      ? {
          details,
          melody: encode(melody),
          markStart: source.marks.start,
          markEnd: source.marks.end,
        }
      : {
          details,
          melody: encode(melody),
          videoId: source.videoId,
          markStart: source.marks.start,
          markEnd: source.marks.end,
          clef,
        };

    try {
      const response = await fetch(
        editing ? `/api/levels/${entry.id}` : "/api/levels",
        {
          method: editing ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const said = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(said.error ?? `The server answered ${response.status}.`);
      }
      // Saved, so there is nothing left to warn about on the way out.
      markSaved();
      window.location.assign("/");
    } catch (error) {
      saving = false;
      showSignatures();
      elements.status.textContent =
        error instanceof Error
          ? `It could not be saved. ${error.message}`
          : "It could not be saved.";
      console.error(error);
    }
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
    elements.toolbar.hidden = false;
    elements.keyboardArea.hidden = false;

    // Built the first time there is a melody, and mutated from then on: it
    // holds the details boxes, and a redraw between two keystrokes would take
    // the caret out of whichever one was being typed into.
    bar ??= createSignatureBar(elements.signatures, {
      onKey: changeKey,
      onMode: (next) => {
        pitchOnly = next;
        mount();
      },
      onUndo: () => step(history?.undo()),
      onRedo: () => step(history?.redo()),
      onDetails: (next) => {
        details = next;
        showSignatures();
      },
      onSubmit: () => void submit(),
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
   */
  window.addEventListener("beforeunload", (event) => {
    if (!isDirty()) return;
    event.preventDefault();
  });

  if (entry.kind === "edit") {
    open(entry.record);
  } else {
    mount();
  }
}
