/**
 * A panel in the bar that opens under its own button.
 *
 * The key chooser and the details boxes are the same kind of thing and were
 * each managing their own `open` flag, which meant neither could know about
 * the other. Two rules that need them to know:
 *
 *   - pressing anywhere outside a panel closes it
 *   - opening one closes the other
 *
 * Both sit in the same bar, both are wide enough to cover the other's button,
 * and neither loses anything by closing: every keystroke in the details boxes
 * is reported as it is typed, and the key chooser commits on the pick.
 *
 * One register with one document listener, rather than a listener per panel —
 * so the count does not grow with the bar.
 */

export type Disclosure = {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
};

const open = new Set<Disclosure>();

/** The element each open disclosure counts as "inside". */
const roots = new WeakMap<Disclosure, HTMLElement>();

let listening = false;

/**
 * Closed on `pointerdown` rather than on `click`.
 *
 * A click is only delivered once the button comes back up, and only if it
 * comes up over the same element it went down on — so a press that starts
 * outside and drags would leave the panel standing. Going down is the moment
 * attention moved.
 */
function listenOnce(): void {
  if (listening) return;
  listening = true;
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    for (const disclosure of [...open]) {
      if (!roots.get(disclosure)?.contains(target)) {
        disclosure.close();
      }
    }
  });
}

export function createDisclosure(options: {
  /** The button and its panel together: a press in here is a press inside. */
  root: HTMLElement;
  /** Put the panel into its open or shut state. Called only on a change. */
  onChange: (isOpen: boolean) => void;
}): Disclosure {
  let showing = false;

  const disclosure: Disclosure = {
    isOpen: () => showing,

    open() {
      if (showing) return;
      // Whatever else was showing was showing under a different button.
      for (const other of [...open]) {
        if (other !== disclosure) other.close();
      }
      showing = true;
      open.add(disclosure);
      options.onChange(true);
    },

    close() {
      if (!showing) return;
      showing = false;
      open.delete(disclosure);
      options.onChange(false);
    },

    toggle() {
      if (showing) disclosure.close();
      else disclosure.open();
    },
  };

  roots.set(disclosure, options.root);
  listenOnce();
  return disclosure;
}
