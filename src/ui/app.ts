import { createHistory, type History } from "../editor/history.js";
import { emptyMelody } from "../editor/operations.js";
import { hasMusic, withKeySignature } from "../editor/signature.js";
import { KeySignature } from "../music/key-signature.js";
import type { Melody } from "../music/melody.js";
import { Pitch } from "../music/pitch.js";
import { createEditor, type Editor, type EditorElements } from "./editor.js";
import { createPlayback, type Playback } from "./playback.js";
import { createSetupPage, type Setup } from "./setup-panel.js";
import { createSignatureBar } from "./signature-bar.js";
import { isTypingTarget } from "./typing-guard.js";
import { mountVideoPanel } from "./video-panel.js";

export type AppElements = EditorElements & {
  signatures: HTMLElement;
  setup: HTMLElement;
  workspace: HTMLElement;
  toolbar: HTMLElement;
  keyboardArea: HTMLElement;
  video: HTMLElement;
  playbackControls: HTMLElement;
  scoreArea: HTMLElement;
};

/** The key a new melody starts in, until it is changed. */
const OPENING_KEY = new KeySignature(new Pitch("C", 0, 4), "major");

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
 */
export function createApp(elements: AppElements): void {
  let melody: Melody | undefined;
  let clef = "treble";
  let pitchOnly = false;
  let editor: Editor | undefined;
  let history: History | undefined;
  let playback: Playback | undefined;

  function showSetup(): void {
    elements.workspace.hidden = true;
    elements.toolbar.hidden = true;
    elements.keyboardArea.hidden = true;
    elements.setup.hidden = false;
    // Built once; the page manages its own regions from then on, and tears
    // itself down before handing over.
    createSetupPage(elements.setup, { onStart: start });
  }

  function start(setup: Setup): void {
    clef = setup.clef;
    // Put on once and then left alone. Every edit rebuilds the controls around
    // the player, and rebuilding the player itself would send the video back to
    // its beginning each time — so the thing that drives it is made out here
    // too, beside it and outside the editor's life. This is a fresh embed: the
    // one on the setup page died with that page, and a seek into the marked
    // section is how playback starts anyway.
    const iframe = mountVideoPanel(elements.video, setup.videoId);
    playback = createPlayback(
      { panel: elements.playbackControls, scoreArea: elements.scoreArea },
      iframe,
      { marks: setup.marks, measures: setup.measures, meter: setup.meter },
      () => editor?.selection(),
    );
    // The melody arrives at its full, final length: every bar the marks span,
    // as rests, waiting to be written into. No edit can add or remove one.
    melody = emptyMelody(OPENING_KEY, setup.meter, setup.measures);
    history = createHistory(melody);
    mount();
  }

  function showSignatures(): void {
    if (!melody || !history) return;
    createSignatureBar(elements.signatures, {
      key: melody.keySignature,
      clef,
      pitchOnly,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      onKey: changeKey,
      onMode: (next) => {
        pitchOnly = next;
        mount();
      },
      onUndo: () => step(history?.undo()),
      onRedo: () => step(history?.redo()),
    });
  }

  function mount(): void {
    if (!melody) {
      showSetup();
      return;
    }
    elements.setup.hidden = true;
    elements.setup.replaceChildren();
    elements.workspace.hidden = false;
    elements.toolbar.hidden = false;
    elements.keyboardArea.hidden = false;

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
   * The browser's own question before written music is thrown away.
   *
   * There is nowhere yet to save a melody to, so everything written lives in
   * this tab and goes with it. Asked here rather than on the link in the bar
   * above because that is only one of the ways out: this one also catches the
   * back button, a reload, and the tab being closed.
   *
   * Nothing to lose, nothing to ask — an untouched page of rests is not work,
   * which is the same reckoning the key change uses.
   */
  window.addEventListener("beforeunload", (event) => {
    if (!melody || !hasMusic(melody)) return;
    event.preventDefault();
  });

  mount();
}
