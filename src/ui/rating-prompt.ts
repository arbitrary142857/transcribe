/**
 * A solver's word on how hard it was: "Suggest difficulty:" and five peppers.
 *
 * A press is the whole gesture, as the heart's is. It was two buttons — Save
 * proposal, Remove proposal — because the old stepper could not say "none" and
 * so could not take a proposal back by itself; the picker can (press the count
 * that stands), which leaves the buttons with nothing to do that the peppers
 * do not already do more directly.
 *
 * Who may propose is `maySpeak`'s answer, asked by the box before this is
 * built: signed in, sharing statistics, on a published tune they solved and
 * did not write. Everybody else gets nothing here at all — a prompt explaining
 * why you may not speak would be a lecture.
 *
 * What is *shown* on the tune's difficulty box does not move when this is
 * pressed. That figure is the blend of the author's word with every solver's,
 * worked out where the tune was listed; it takes the next listing to fold a
 * fresh proposal in, and guessing at it here would print a number no query
 * agrees with.
 */

import type { TranscriptionSummary } from "../shared/transcription.js";
import { createDifficultyPicker } from "./difficulty-picker.js";

export function difficultyProposal(level: TranscriptionSummary): HTMLElement {
  const element = document.createElement("div");
  element.className = "proposal";

  const lead = document.createElement("span");
  lead.className = "proposal-lead";
  lead.textContent = "Suggest difficulty:";

  const trouble = document.createElement("span");
  trouble.className = "proposal-trouble";
  trouble.setAttribute("role", "status");

  const address = `/api/tunes/${encodeURIComponent(level.id)}/rating`;

  /** What the database holds for this account, as far as this box knows. */
  let saved: number | undefined;
  let sending = false;

  // A solver may always stop proposing, so the × is here.
  const picker = createDifficultyPicker({
    value: undefined,
    label: "Suggest difficulty",
    clearable: true,
    onChange: (stars) => void send(stars),
  });

  async function send(stars: number | undefined): Promise<void> {
    if (sending) return;
    sending = true;
    trouble.textContent = "";
    const wanted = stars;
    try {
      const response =
        wanted === undefined
          ? await fetch(address, {
              method: "DELETE",
              headers: { accept: "application/json" },
            })
          : await fetch(address, {
              method: "PUT",
              headers: {
                "content-type": "application/json",
                accept: "application/json",
              },
              body: JSON.stringify({ stars: wanted }),
            });
      if (response.ok) {
        saved = wanted;
      } else {
        const said = (await response.json().catch(() => ({}))) as { error?: string };
        trouble.textContent = said.error ?? `The server answered ${response.status}.`;
        // Back to what the database actually holds: a row of peppers that
        // stayed lit after a refusal would be the box lying about the figure.
        picker.set(saved);
      }
    } catch {
      trouble.textContent = "The proposal could not be sent.";
      picker.set(saved);
    } finally {
      sending = false;
    }
  }

  // The proposal this account already made, if any, arriving after the box has
  // drawn — a late fill, like the heart's.
  void (async () => {
    try {
      const response = await fetch(address, { headers: { accept: "application/json" } });
      if (!response.ok || response.status === 204) return;
      const said = (await response.json()) as { stars?: number };
      if (typeof said.stars === "number") {
        saved = said.stars;
        picker.set(said.stars);
      }
    } catch {
      // The row opens empty; pressing it still works.
    }
  })();

  element.append(lead, picker.element, trouble);
  return element;
}
