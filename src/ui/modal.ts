/**
 * Something the page stops for.
 *
 * Four kinds now: a question that cannot be taken back — leaving the setup
 * page, deleting a level — a level's details, which asks nothing and simply
 * wants reading, a small form, which asks for words and waits on them, and a
 * question whose yes is a control of the caller's own. They share everything
 * except what goes in the box, so the shell below is the shared part and the
 * exports are what fills it.
 *
 * While any is open it blankets every keyboard shortcut on the page: the
 * blanket is a capture-phase listener on the window, and all of the app's
 * shortcuts listen at bubble phase, so they simply never hear anything. That
 * keeps every one of them ignorant of modals rather than each carrying a check.
 */

import { closeIcon } from "./icons.js";

/** What can hold focus inside a dialog. */
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

type ShellOptions = {
  /** Given a way to close with an answer, build what goes in the box. */
  fill: (close: (answer: boolean) => void) => readonly Node[];
  /** Extra classes for the box, for anything that needs to be wider. */
  className?: string;
  /**
   * Put an × in the corner.
   *
   * Only for a box that asks nothing. Where there is a question to answer, an ×
   * has to stand for one of the answers and there is no saying which — a
   * confirm dialog with a corner × asks the reader to guess whether it means
   * cancel or just "go away", and the two are the same only by luck.
   */
  dismissable?: boolean;
  /** Called once, with whatever `close` was called with. */
  onClose: (answer: boolean) => void;
};

/**
 * Put a box over the page and keep the keyboard inside it.
 *
 * Tab cycles through whatever the box holds rather than through a known pair
 * of buttons: the confirm has two and a level's details has three, and neither
 * should have to say so.
 */
function openShell(options: ShellOptions): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const box = document.createElement("div");
  box.className = `panel modal-box${options.className ? ` ${options.className}` : ""}`;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  const opener = document.activeElement;
  let closed = false;

  function close(answer: boolean): void {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
    if (opener instanceof HTMLElement) {
      opener.focus();
    }
    options.onClose(answer);
  }

  function onKey(event: KeyboardEvent): void {
    // Nothing leaks past the dialog while it is up.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close(false);
      return;
    }
    if (event.key !== "Tab") return;

    const stops = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (stops.length === 0) return;
    event.preventDefault();
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const step = event.shiftKey ? -1 : 1;
    // Wraps at both ends, so focus never walks out of the box.
    stops[(at + step + stops.length) % stops.length]!.focus();
  }

  // First in the box, so it is also first in the tab order and takes the
  // opening focus: the way out is a safe place for focus to land, and a corner
  // × that could only be reached by tabbing through everything else would be a
  // way out for the mouse alone.
  if (options.dismissable) {
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "modal-close";
    dismiss.setAttribute("aria-label", "Close");
    // Drawn rather than typed: see `closeIcon`. A letter or a sign both leave
    // the ink off the centre of the button under it.
    dismiss.innerHTML = closeIcon();
    dismiss.addEventListener("click", () => close(false));
    box.append(dismiss);
  }

  box.append(...options.fill(close));
  overlay.append(box);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close(false);
  });
  window.addEventListener("keydown", onKey, true);

  document.body.append(overlay);
  box.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}

/**
 * One paragraph of a message: a sentence, or its parts where some of them are
 * marked.
 *
 * A dialog that asks somebody to check a number against the video has to be
 * able to say which words are the numbers, and a paragraph set as one string
 * cannot. `marked()` builds the parts that stand out.
 */
export type ModalLine = string | readonly (string | Node)[];

/** A phrase the reader is meant to stop on, in the app's accent. */
export function marked(text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "modal-marked";
  span.textContent = text;
  return span;
}

/** One paragraph of a message, however the caller spelled it. */
function paragraph(line: ModalLine): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = "modal-body";
  if (typeof line === "string") {
    element.textContent = line;
  } else {
    element.append(...line);
  }
  return element;
}

export type ModalOptions = {
  title: string;
  /** Lines of the message; each becomes its own paragraph. */
  body: readonly ModalLine[];
  /** What the committing button says. */
  confirm: string;
  /** What the retreating button says. */
  cancel: string;
  /** Extra classes for the box, for a question drawn to its own page's scale. */
  className?: string;
};

export function openModal(options: ModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    openShell({
      className: options.className,
      onClose: resolve,
      fill(close) {
        const heading = document.createElement("h2");
        heading.className = "modal-title";
        heading.textContent = options.title;

        const lines = options.body.map(paragraph);

        const buttons = document.createElement("div");
        buttons.className = "modal-buttons";

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "modal-cancel";
        cancel.textContent = options.cancel;
        cancel.addEventListener("click", () => close(false));

        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.className = "modal-confirm";
        confirm.textContent = options.confirm;
        confirm.addEventListener("click", () => close(true));

        // Retreat first, and so focused first: the question exists to slow
        // things down, and the default answer is no.
        buttons.append(cancel, confirm);
        return [heading, ...lines, buttons];
      },
    });
  });
}

export type ChoiceModalOptions = {
  title: string;
  body: readonly ModalLine[];
  /** What the retreating button says. */
  cancel: string;
  /**
   * The committing control, built by the caller — for the one case where it
   * is not a plain button: the way in to Google, which has to look as Google
   * says and is a link rather than a button besides.
   */
  choice: () => HTMLElement;
};

/**
 * A question whose yes is the caller's own control.
 *
 * Resolves false when the box is closed without it; the yes, being a link,
 * leaves the page, so the promise settling at all means the answer was no.
 */
export function openChoiceModal(options: ChoiceModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    openShell({
      onClose: resolve,
      fill(close) {
        const heading = document.createElement("h2");
        heading.className = "modal-title";
        heading.textContent = options.title;

        const lines = options.body.map(paragraph);

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "modal-cancel";
        cancel.textContent = options.cancel;
        cancel.addEventListener("click", () => close(false));

        const buttons = document.createElement("div");
        buttons.className = "modal-buttons";
        // Retreat first, and so focused first, as in every question here.
        buttons.append(cancel, options.choice());
        return [heading, ...lines, buttons];
      },
    });
  });
}

export type FormModalOptions = {
  title: string;
  /**
   * Build the fields. Handed a way to say whether what they hold could be
   * saved, which is what greys the committing button and ungreys it.
   */
  fill: (form: { setValid(ok: boolean): void }) => readonly Node[];
  /** What the committing button says. */
  confirm: string;
  /** What the retreating button says. */
  cancel: string;
  /** Whether the fields start out saveable. */
  valid?: boolean;
  className?: string;
};

/**
 * A box with something to fill in.
 *
 * Like `openModal`, it answers yes or no — but the yes can be withheld while a
 * field is wrong, which is the one thing the confirm dialog never needed. The
 * first field takes the opening focus rather than the way out: somebody who
 * opened a form means to type into it. Escape and the backdrop still mean no.
 */
export function openFormModal(options: FormModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    openShell({
      className: options.className,
      onClose: resolve,
      fill(close) {
        const heading = document.createElement("h2");
        heading.className = "modal-title";
        heading.textContent = options.title;

        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.className = "modal-confirm";
        confirm.textContent = options.confirm;
        confirm.disabled = options.valid === false;
        confirm.addEventListener("click", () => close(true));

        const fields = options.fill({
          setValid(ok) {
            confirm.disabled = !ok;
          },
        });

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "modal-cancel";
        cancel.textContent = options.cancel;
        cancel.addEventListener("click", () => close(false));

        const buttons = document.createElement("div");
        buttons.className = "modal-buttons";
        buttons.append(cancel, confirm);
        return [heading, ...fields, buttons];
      },
    });
  });
}

/**
 * A box that only wants reading.
 *
 * Nothing is decided here, so nothing is returned: it closes on Escape, on the
 * backdrop, and on whatever the caller put inside it.
 */
export function openInfoModal(options: {
  className?: string;
  fill: (close: () => void) => readonly Node[];
  /**
   * Called once the box has gone, however it went — a button, the ×, Escape,
   * the backdrop. The puzzle page starts its clock again here, so it has to
   * hear about every way out rather than about the ones with buttons on them.
   */
  onClose?: () => void;
}): void {
  openShell({
    className: options.className,
    // Nothing is decided here, so an × in the corner can only mean one thing.
    dismissable: true,
    // There is no answer to give, so the caller is handed a plain `close` and
    // the shell's yes/no is filled in here rather than at every call site.
    fill: (close) => options.fill(() => close(false)),
    onClose: () => options.onClose?.(),
  });
}
