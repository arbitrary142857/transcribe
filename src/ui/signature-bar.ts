import type { KeySignature } from "../music/key-signature.js";
import { renderKeyPanel } from "./key-panel.js";

const ACCIDENTAL_LABEL: Record<number, string> = {
  [-2]: "𝄫", [-1]: "♭", 0: "", 1: "♯", 2: "𝄪",
};

const keyLabel = (key: KeySignature) =>
  `${key.tonic.letter}${ACCIDENTAL_LABEL[key.tonic.accidental] ?? ""} ${key.mode}`;

export type SignatureBarOptions = {
  key: KeySignature;
  clef: string;
  pitchOnly: boolean;
  onKey: (key: KeySignature) => void;
  onMode: (pitchOnly: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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
export const UNDO_KEY = APPLE ? "\u2318Z" : "Ctrl+Z";
export const REDO_KEY = APPLE ? "\u21E7\u2318Z" : "Ctrl+Y";

function chip(
  label: string,
  shortcut: string,
  enabled: boolean,
  run: () => void,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.title = `${label} (${shortcut})`;
  button.innerHTML = `${label}<kbd class="chip-key">${shortcut}</kbd>`;
  button.disabled = !enabled;
  button.addEventListener("click", run);
  return button;
}

/**
 * The bar above the music: which key it is in, which way you are working, and
 * the way back.
 *
 * The clef and the meter are not here. They are settled before any note is
 * written and printed on the stave from then on, so a control for either would
 * only offer something that cannot be done.
 */
export function createSignatureBar(
  element: HTMLElement,
  options: SignatureBarOptions,
): void {
  element.replaceChildren();

  // ---- key -------------------------------------------------------------

  const keyGroup = document.createElement("div");
  keyGroup.className = "key-picker";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "key-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `<span class="key-toggle-label">Key</span><span class="key-toggle-value">${keyLabel(options.key)}</span>`;

  const panel = document.createElement("div");
  panel.className = "key-panel";
  panel.hidden = true;

  let open = false;
  const setOpen = (next: boolean) => {
    open = next;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.classList.toggle("is-on", open);
    if (open) {
      // Drawn on opening rather than up front: fifteen staves is real work, and
      // most sessions never change key at all.
      renderKeyPanel(panel, {
        clef: options.clef,
        current: options.key,
        onPick: (key) => {
          setOpen(false);
          options.onKey(key);
        },
      });
    }
  };

  toggle.addEventListener("click", () => setOpen(!open));
  keyGroup.append(toggle, panel);

  // ---- mode ------------------------------------------------------------

  const mode = document.createElement("div");
  mode.className = "mode-switch";
  mode.setAttribute("role", "group");
  mode.setAttribute("aria-label", "What the controls edit");

  for (const [label, pitchOnly] of [
    ["Melody", false],
    ["Pitches only", true],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-option";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(options.pitchOnly === pitchOnly));
    if (options.pitchOnly === pitchOnly) button.classList.add("is-on");
    button.addEventListener("click", () => options.onMode(pitchOnly));
    mode.append(button);
  }

  // ---- history ---------------------------------------------------------

  const history = document.createElement("div");
  history.className = "history";
  history.append(
    chip("Undo", UNDO_KEY, options.canUndo, options.onUndo),
    chip("Redo", REDO_KEY, options.canRedo, options.onRedo),
  );

  element.append(keyGroup, mode, history);
}
