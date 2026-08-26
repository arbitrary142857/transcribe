/**
 * A solver's chance to say how hard it was.
 *
 * Drawn only for somebody who may actually rate: signed in, sharing their
 * statistics, standing on a published level they solved and did not write —
 * the client's mirror of the rating route's refusals, so the control never
 * offers what the server would refuse. Everybody else simply sees no prompt;
 * a prompt with a sentence about why it is disabled would be a lecture.
 *
 * The stepper opens provisional at the middle of the scale, or at the rating
 * this account already gave, fetched after the box is drawn (the box fills
 * synchronously; a value arriving late just moves the stepper). Every press
 * sends the new figure — the route's upsert makes a change of mind cheap and
 * a race last-write-wins — and a refusal is printed under the stepper, which
 * is the only place there is.
 *
 * Laid out as a little column on purpose: the solved box will later grow an
 * actions row under this — a way back to the level list, a thumbs-up — and
 * the column is where those will go.
 */

import type { UserSummary } from "../shared/session.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import { createDifficultyStepper } from "./difficulty-stepper.js";

export function maybeRatingPrompt(options: {
  level: TranscriptionSummary;
  viewer: UserSummary | undefined;
  solved: boolean;
}): HTMLElement | undefined {
  const { level, viewer } = options;
  if (
    viewer === undefined ||
    !viewer.shareStats ||
    !options.solved ||
    level.status !== "published" ||
    level.ownerId === viewer.id
  ) {
    return undefined;
  }

  const element = document.createElement("div");
  element.className = "rating-prompt";

  const lead = document.createElement("p");
  lead.className = "rating-prompt-lead";
  lead.textContent = "How hard was it for you?";

  const status = document.createElement("p");
  status.className = "rating-prompt-status";
  status.setAttribute("role", "status");

  const address = `/api/levels/${encodeURIComponent(level.id)}/rating`;

  const stepper = createDifficultyStepper({
    value: undefined,
    onChange: (stars) => void send(stars),
  });

  async function send(stars: number): Promise<void> {
    status.textContent = "";
    try {
      const response = await fetch(address, {
        method: "PUT",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ stars }),
      });
      if (!response.ok) {
        const said = (await response.json().catch(() => ({}))) as { error?: string };
        status.textContent = said.error ?? `The server answered ${response.status}.`;
      }
    } catch {
      status.textContent = "The rating could not be sent.";
    }
  }

  // The rating this account already gave, if any: 200 carries it, 204 is
  // "nothing yet" and the stepper stays provisional.
  void (async () => {
    try {
      const response = await fetch(address, { headers: { accept: "application/json" } });
      if (!response.ok || response.status === 204) return;
      const said = (await response.json()) as { stars?: number };
      if (typeof said.stars === "number") stepper.set(said.stars);
    } catch {
      // Nothing: the prompt still works, it just opens at the middle.
    }
  })();

  const how = document.createElement("a");
  how.className = "rating-prompt-how";
  how.href = "/about";
  how.textContent = "How ratings work";

  element.append(lead, stepper.element, status, how);
  return element;
}
