/**
 * A question the page stops for.
 *
 * Used exactly once, for the one decision that cannot be taken back — leaving
 * the setup page. While open it blankets every keyboard shortcut on the page:
 * the blanket is a capture-phase listener on the window, and all of the app's
 * shortcuts listen at bubble phase, so they simply never hear anything. That
 * keeps every one of them ignorant of modals rather than each carrying a
 * check.
 */
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
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const box = document.createElement("div");
    box.className = "panel modal-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    const heading = document.createElement("h2");
    heading.className = "modal-title";
    heading.textContent = options.title;
    box.append(heading);

    for (const line of options.body) {
      const paragraph = document.createElement("p");
      paragraph.className = "modal-body";
      paragraph.textContent = line;
      box.append(paragraph);
    }

    const buttons = document.createElement("div");
    buttons.className = "modal-buttons";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "modal-cancel";
    cancel.textContent = options.cancel;

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "modal-confirm";
    confirm.textContent = options.confirm;

    buttons.append(cancel, confirm);
    box.append(buttons);
    overlay.append(box);

    const opener = document.activeElement;

    function close(answer: boolean): void {
      window.removeEventListener("keydown", onKey, true);
      overlay.remove();
      if (opener instanceof HTMLElement) {
        opener.focus();
      }
      resolve(answer);
    }

    function onKey(event: KeyboardEvent): void {
      // Nothing leaks past the dialog while it is up.
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key === "Tab") {
        // Two buttons; Tab walks between them and never out.
        event.preventDefault();
        (document.activeElement === cancel ? confirm : cancel).focus();
      }
    }

    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) close(false);
    });
    window.addEventListener("keydown", onKey, true);

    document.body.append(overlay);
    // Retreat is the default, because the question exists to slow things down.
    cancel.focus();
  });
}
