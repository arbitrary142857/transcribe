import type { KeySignature } from "../music/key-signature.js";
import type { TranscriptionDetails } from "../shared/transcription.js";
import { createDetailsPanel } from "./details-panel.js";
import { renderKeyPanel } from "./key-panel.js";

const ACCIDENTAL_LABEL: Record<number, string> = {
  [-2]: "𝄫", [-1]: "♭", 0: "", 1: "♯", 2: "𝄪",
};

const keyLabel = (key: KeySignature) =>
  `${key.tonic.letter}${ACCIDENTAL_LABEL[key.tonic.accidental] ?? ""} ${key.mode}`;

export type SignatureBarState = {
  key: KeySignature;
  clef: string;
  pitchOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  details: TranscriptionDetails;
  /** What the button says: submitting a new one, or saving an old one. */
  submitLabel: string;
  /** Why it cannot be pressed, or nothing if it can. */
  submitProblem: string | undefined;
  /** True while the request is out, so a second press cannot make a second level. */
  saving: boolean;
};

export type SignatureBarHandlers = {
  onKey: (key: KeySignature) => void;
  onMode: (pitchOnly: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDetails: (details: TranscriptionDetails) => void;
  onSubmit: () => void;
};

export type SignatureBar = {
  update(state: SignatureBarState): void;
};

/**
 * Whether this looks like an Apple keyboard.
 *
 * Only decides which way to print the shortcut; both are listened for either
 * way, so guessing wrong costs a label rather than a feature.
 */
const APPLE = /mac|iphone|ipad|ipod/i.test(
  navigator.userAgent + " " + (navigator.platform ?? ""),
);

/** The modifier as its own keyboard prints it. */
export const UNDO_KEY = APPLE ? "⌘Z" : "Ctrl+Z";
export const REDO_KEY = APPLE ? "⇧⌘Z" : "Ctrl+Y";

function chip(label: string, shortcut: string, run: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.title = `${label} (${shortcut})`;
  button.innerHTML = `${label}<kbd class="chip-key">${shortcut}</kbd>`;
  button.addEventListener("click", run);
  return button;
}

/**
 * The bar above the music: what it is called, which key it is in, which way
 * you are working, the way back, and the way out.
 *
 * The clef and the meter are not here. They are settled before any note is
 * written and printed on the stave from then on, so a control for either would
 * only offer something that cannot be done.
 *
 * Built once and mutated from then on, unlike the rest of the page's controls,
 * which are redrawn whole. The details panel holds three boxes somebody may be
 * typing into, and this bar is rebuilt on every edit — a redraw between two
 * keystrokes would take the caret with it.
 */
export function createSignatureBar(
  element: HTMLElement,
  handlers: SignatureBarHandlers,
): SignatureBar {
  element.replaceChildren();

  /** The last state seen, for the panels that are drawn only on opening. */
  let shown: SignatureBarState | undefined;

  // ---- key -------------------------------------------------------------

  const keyGroup = document.createElement("div");
  keyGroup.className = "key-picker";

  const keyToggle = document.createElement("button");
  keyToggle.type = "button";
  keyToggle.className = "key-toggle";
  keyToggle.setAttribute("aria-expanded", "false");

  const keyValue = document.createElement("span");
  keyValue.className = "key-toggle-value";
  const keyName = document.createElement("span");
  keyName.className = "key-toggle-label";
  keyName.textContent = "Key";
  keyToggle.append(keyName, keyValue);

  const keyPanel = document.createElement("div");
  keyPanel.className = "key-panel";
  keyPanel.hidden = true;

  let keyOpen = false;
  const setKeyOpen = (next: boolean) => {
    keyOpen = next;
    keyPanel.hidden = !keyOpen;
    keyToggle.setAttribute("aria-expanded", String(keyOpen));
    keyToggle.classList.toggle("is-on", keyOpen);
    if (keyOpen && shown) {
      // Drawn on opening rather than up front: fifteen staves is real work, and
      // most sessions never change key at all.
      renderKeyPanel(keyPanel, {
        clef: shown.clef,
        current: shown.key,
        onPick: (key) => {
          setKeyOpen(false);
          handlers.onKey(key);
        },
      });
    }
  };

  keyToggle.addEventListener("click", () => setKeyOpen(!keyOpen));
  keyGroup.append(keyToggle, keyPanel);

  // ---- details ---------------------------------------------------------

  const details = createDetailsPanel(handlers.onDetails);

  // ---- mode ------------------------------------------------------------

  const mode = document.createElement("div");
  mode.className = "mode-switch";
  mode.setAttribute("role", "group");
  mode.setAttribute("aria-label", "What the controls edit");

  const modeOptions = ([
    ["Melody", false],
    ["Pitches only", true],
  ] as const).map(([label, pitchOnly]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-option";
    button.textContent = label;
    button.addEventListener("click", () => handlers.onMode(pitchOnly));
    mode.append(button);
    return { button, pitchOnly };
  });

  // ---- history and the way out ------------------------------------------

  const undo = chip("Undo", UNDO_KEY, handlers.onUndo);
  const redo = chip("Redo", REDO_KEY, handlers.onRedo);

  const history = document.createElement("div");
  history.className = "history";
  history.append(undo, redo);

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "submit-button";
  submit.addEventListener("click", handlers.onSubmit);

  // Says why it cannot be pressed, in the shape the setup page's Start button
  // already uses: the button greys and the sentence appears beside it.
  const submitNote = document.createElement("p");
  submitNote.className = "submit-note";
  submitNote.setAttribute("role", "status");

  const submitGroup = document.createElement("div");
  submitGroup.className = "submit-group";
  submitGroup.append(submit, submitNote);

  element.append(keyGroup, details.element, mode, history, submitGroup);

  return {
    update(state) {
      shown = state;

      keyValue.textContent = keyLabel(state.key);
      details.update(state.details);

      for (const option of modeOptions) {
        const on = state.pitchOnly === option.pitchOnly;
        option.button.setAttribute("aria-pressed", String(on));
        option.button.classList.toggle("is-on", on);
      }

      undo.disabled = !state.canUndo;
      redo.disabled = !state.canRedo;

      submit.textContent = state.saving ? "Saving…" : state.submitLabel;
      submit.disabled = state.saving || state.submitProblem !== undefined;
      submitNote.textContent = state.saving ? "" : (state.submitProblem ?? "");
    },
  };
}
