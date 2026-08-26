/**
 * The viewer's part in a solved level's figures, whichever part is theirs.
 *
 * For a solver who may speak — signed in, sharing their statistics, not the
 * author, level published — it is the difficulty proposal: a stepper that
 * edits a *pending* figure, and two buttons that say plainly what reaches
 * the database. Save proposal sends the pending figure; Remove proposal
 * takes a saved one back and returns the stepper to its quiet provisional
 * middle. Nothing is sent by the stepper itself, unlike the heart, whose
 * single press is its own feedback.
 *
 * For the author it is a note instead: their word is the anchor the
 * players' proposals lean on, set from the details box — and a way into
 * that box, since "go edit it" without a door is a scavenger hunt. The
 * author is refused the player pathway by the server; this is the box
 * agreeing.
 *
 * Everybody else — signed out, or keeping their play out of the figures —
 * gets nothing at all: a prompt about why you may not would be a lecture.
 */

import type { UserSummary } from "../shared/session.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import { createDifficultyStepper } from "./difficulty-stepper.js";

/** The prompt, the author's note, or nothing, by who is looking. */
export function solvedContribution(options: {
  level: TranscriptionSummary;
  viewer: UserSummary | undefined;
  solved: boolean;
  /** What Edit details does here: the callers own their refresh. */
  onEditDetails: () => void;
}): HTMLElement | undefined {
  const { level, viewer } = options;
  if (
    viewer === undefined ||
    !options.solved ||
    level.status !== "published"
  ) {
    return undefined;
  }
  if (level.ownerId === viewer.id) {
    return authorNote(options.onEditDetails);
  }
  return viewer.shareStats ? ratingPrompt(level) : undefined;
}

/** The author's face of the solved box: no proposing, and the real door. */
function authorNote(onEditDetails: () => void): HTMLElement {
  const element = document.createElement("div");
  element.className = "rating-prompt author-note";

  const lead = document.createElement("p");
  lead.className = "rating-prompt-lead";
  lead.textContent =
    "This level is yours: its difficulty is the word players' proposals lean on, set from the details box.";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "rating-prompt-button";
  edit.textContent = "Edit details";
  edit.addEventListener("click", onEditDetails);

  element.append(lead, edit);
  return element;
}

function ratingPrompt(level: TranscriptionSummary): HTMLElement {
  const element = document.createElement("div");
  element.className = "rating-prompt";

  const lead = document.createElement("p");
  lead.className = "rating-prompt-lead";
  lead.textContent = "How hard was it for you?";

  const status = document.createElement("p");
  status.className = "rating-prompt-status";
  status.setAttribute("role", "status");

  const address = `/api/levels/${encodeURIComponent(level.id)}/rating`;

  /** The stepper's figure, not yet anybody's until Save says so. */
  let pending: number | undefined;
  /** Whether a proposal of this account's stands in the database. */
  let saved = false;
  let sending = false;

  const stepper = createDifficultyStepper({
    value: undefined,
    onChange: (stars) => {
      pending = stars;
      status.textContent = "";
      drawButtons();
    },
  });

  const save = document.createElement("button");
  save.type = "button";
  save.className = "rating-prompt-button";
  save.textContent = "Save proposal";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "rating-prompt-button rating-prompt-remove";
  remove.textContent = "Remove proposal";

  function drawButtons(): void {
    // Nothing to save until the stepper has been touched or a saved
    // proposal fetched; nothing to remove until one stands.
    save.disabled = sending || pending === undefined;
    remove.disabled = sending || !saved;
  }

  async function send(
    request: () => Promise<Response>,
    settle: () => string,
  ): Promise<void> {
    sending = true;
    drawButtons();
    status.textContent = "";
    status.classList.remove("is-wrong");
    try {
      const response = await request();
      if (response.ok) {
        status.textContent = settle();
      } else {
        const said = (await response.json().catch(() => ({}))) as { error?: string };
        status.classList.add("is-wrong");
        status.textContent = said.error ?? `The server answered ${response.status}.`;
      }
    } catch {
      status.classList.add("is-wrong");
      status.textContent = "The proposal could not be sent.";
    } finally {
      sending = false;
      drawButtons();
    }
  }

  save.addEventListener("click", () => {
    const stars = pending;
    if (stars === undefined) return; // the button is disabled, but belts.
    void send(
      () =>
        fetch(address, {
          method: "PUT",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ stars }),
        }),
      () => {
        saved = true;
        return "Saved.";
      },
    );
  });

  remove.addEventListener("click", () => {
    void send(
      () => fetch(address, { method: "DELETE", headers: { accept: "application/json" } }),
      () => {
        saved = false;
        pending = undefined;
        stepper.set(undefined);
        return "Removed.";
      },
    );
  });

  // The proposal this account already saved, if any, arriving after the box
  // has drawn: it becomes both the stepper's figure and the removable state.
  void (async () => {
    try {
      const response = await fetch(address, { headers: { accept: "application/json" } });
      if (!response.ok || response.status === 204) return;
      const said = (await response.json()) as { stars?: number };
      if (typeof said.stars === "number") {
        pending = said.stars;
        saved = true;
        stepper.set(said.stars);
        drawButtons();
      }
    } catch {
      // The prompt still works; it just opens at the middle.
    }
  })();

  const buttons = document.createElement("div");
  buttons.className = "rating-prompt-buttons";
  buttons.append(save, remove);

  const how = document.createElement("a");
  how.className = "rating-prompt-how";
  how.href = "/about";
  how.textContent = "How ratings work";

  drawButtons();
  element.append(lead, stepper.element, buttons, status, how);
  return element;
}
