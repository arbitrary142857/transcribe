/**
 * The words of a published level, changed without opening the editor.
 *
 * Once a level is published its music is frozen — players are reading it, and
 * their attempts are keyed to it note by note — so the editor, which exists to
 * change music, is the wrong door. What may still change is what the editor's
 * Details panel holds, and this is that panel on its own, in a box, sending
 * only the words. The route takes a body with no melody to mean the music is
 * unchanged, which is the whole of what makes this small.
 */

import {
  detailsProblem,
  LIMITS,
  type TranscriptionDetails,
  type TranscriptionSummary,
} from "../shared/transcription.js";
import { createField } from "./details-panel.js";
import { openFormModal } from "./modal.js";

/**
 * Open the box and, if Save was pressed, send the new words.
 *
 * True when the server took them, false when the box was closed without
 * saving. A refusal from the server is thrown as its sentence, for the caller
 * to put wherever it reports such things — the box has closed by then, and
 * the words typed into it are gone with it, which is the one rough edge here.
 */
export async function editDetails(level: TranscriptionSummary): Promise<boolean> {
  let details: TranscriptionDetails = {
    title: level.title,
    subtitle: level.subtitle ?? "",
    instructions: level.instructions ?? "",
  };

  const agreed = await openFormModal({
    title: "Edit the details",
    confirm: "Save",
    cancel: "Cancel",
    className: "details-modal",
    valid: detailsProblem(details) === undefined,
    fill(form) {
      const problem = document.createElement("p");
      problem.className = "modal-body details-modal-problem";
      problem.setAttribute("role", "status");

      const report = () => {
        details = {
          title: title.input.value,
          subtitle: subtitle.input.value,
          instructions: instructions.input.value,
        };
        const wrong = detailsProblem(details);
        problem.textContent = wrong ?? "";
        form.setValid(wrong === undefined);
      };

      const title = createField(
        { label: "Title", hint: "Clair de lune", max: LIMITS.title.max, required: true },
        report,
      );
      const subtitle = createField(
        { label: "Subtitle", hint: "Debussy", max: LIMITS.subtitle.max },
        report,
      );
      const instructions = createField(
        {
          label: "Instructions",
          hint: "Anything worth knowing before playing it.",
          max: LIMITS.instructions.max,
          lines: 4,
        },
        report,
      );
      title.show(details.title);
      subtitle.show(details.subtitle ?? "");
      instructions.show(details.instructions ?? "");

      return [title.row, subtitle.row, instructions.row, problem];
    },
  });
  if (!agreed) return false;

  const response = await fetch(`/api/levels/${encodeURIComponent(level.id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    // The words alone. No melody means the music is as it was.
    body: JSON.stringify({ details }),
  });
  if (!response.ok) {
    const said = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(said.error ?? `The server answered ${response.status}.`);
  }
  return true;
}
