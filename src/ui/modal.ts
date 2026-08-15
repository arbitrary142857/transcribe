/**
 * Something the page stops for.
 *
 * Two kinds now: a question that cannot be taken back — leaving the setup page
 * — and a level's details, which asks nothing and simply wants reading. They
 * share everything except what goes in the box, so the shell below is the
 * shared part and the two exports are what fills it.
 *
 * While either is open it blankets every keyboard shortcut on the page: the
 * blanket is a capture-phase listener on the window, and all of the app's
 * shortcuts listen at bubble phase, so they simply never hear anything. That
 * keeps every one of them ignorant of modals rather than each carrying a check.
 */

/** What can hold focus inside a dialog. */
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

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
    // The glyph is a multiplication sign rather than a letter x, which at this
    // size leans and reads as a letter.
    dismiss.textContent = "×";
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

export type ModalOptions = {
  title: string;
  /** Lines of the message; each becomes its own paragraph. */
  body: readonly string[];
  /** What the committing button says. */
  confirm: string;
  /** What the retreating button says. */
  cancel: string;
};

export function openModal(options: ModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    openShell({
      onClose: resolve,
      fill(close) {
        const heading = document.createElement("h2");
        heading.className = "modal-title";
        heading.textContent = options.title;

        const lines = options.body.map((line) => {
          const paragraph = document.createElement("p");
          paragraph.className = "modal-body";
          paragraph.textContent = line;
          return paragraph;
        });

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

/**
 * A box that only wants reading.
 *
 * Nothing is decided here, so nothing is returned: it closes on Escape, on the
 * backdrop, and on whatever the caller put inside it.
 */
export function openInfoModal(options: {
  className?: string;
  fill: (close: () => void) => readonly Node[];
}): void {
  openShell({
    className: options.className,
    // Nothing is decided here, so an × in the corner can only mean one thing.
    dismissable: true,
    // There is no answer to give, so the caller is handed a plain `close` and
    // the shell's yes/no is filled in here rather than at every call site.
    fill: (close) => options.fill(() => close(false)),
    onClose: () => {},
  });
}
