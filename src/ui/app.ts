import { createHistory, type History } from "../editor/history.js";
import { emptyMelody } from "../editor/operations.js";
import { withKeySignature } from "../editor/signature.js";
import { KeySignature } from "../music/key-signature.js";
import type { Melody } from "../music/melody.js";
import { Pitch } from "../music/pitch.js";
import type { TimeSignature } from "../music/types.js";
import { createEditor, type Editor, type EditorElements } from "./editor.js";
import { renderSetupPanel, type SetupChoice } from "./setup-panel.js";
import { createSignatureBar } from "./signature-bar.js";

export type AppElements = EditorElements & {
  signatures: HTMLElement;
  setup: HTMLElement;
  workspace: HTMLElement;
  toolbar: HTMLElement;
  keyboardArea: HTMLElement;
};

/** The key a new melody starts in, until it is changed. */
const OPENING_KEY = new KeySignature(new Pitch("C", 0, 4), "major");

/**
 * Hold the melody and the controls around it.
 *
 * The page has two lives. Before there is a melody it asks only for the clef
 * and the meter, since neither can be changed once music depends on them.
 * Afterwards it never mentions either again — they are printed on the stave,
 * which is a better place to read them from than a control that cannot be used.
 */
export function createApp(elements: AppElements): void {
  let melody: Melody | undefined;
  let clef = "treble";
  let pitchOnly = false;
  let editor: Editor | undefined;
  let history: History | undefined;
  let chosen: SetupChoice = {};

  function showSetup(): void {
    elements.workspace.hidden = true;
    elements.toolbar.hidden = true;
    elements.keyboardArea.hidden = true;
    elements.setup.hidden = false;
    renderSetupPanel(elements.setup, {
      chosen,
      onChoose: (next) => {
        chosen = next;
        showSetup();
      },
      onSubmit: start,
    });
  }

  function start(pickedClef: string, meter: TimeSignature): void {
    clef = pickedClef;
    melody = emptyMelody(OPENING_KEY, meter);
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

    editor?.destroy();
    showSignatures();
    editor = createEditor(melody, elements, {
      clef,
      pitchOnly,
      onEdit: () => {
        if (!melody) return;
        history?.record(melody);
        showSignatures();
      },
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

  mount();
}
