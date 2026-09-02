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
import { createField, difficultyRow } from "./details-panel.js";
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
    difficulty: level.authorDifficulty,
  };

  const agreed = await openFormModal({
    title: "Edit the details",
    // "Save Changes" rather than "Save": nothing typed into this box has
    // reached the database yet, the picker's presses included, and the button
    // is where that happens.
    confirm: "Save Changes",
    cancel: "Cancel",
    className: "details-modal",
    valid: detailsProblem(details, level.status) === undefined,
    fill(form) {
      const problem = document.createElement("p");
      problem.className = "modal-body details-modal-problem";
      problem.setAttribute("role", "status");

      let difficulty = details.difficulty;
      const report = () => {
        details = {
          title: title.input.value,
          subtitle: subtitle.input.value,
          instructions: instructions.input.value,
          difficulty,
        };
        // The tune's own status decides one of the rules: a published tune
        // keeps a difficulty, and the picker can now take one away. The server
        // refuses the same save; this is the box saying so first, in the same
        // red the rest of the app is wrong in.
        const wrong = detailsProblem(details, level.status);
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

      const stars = difficultyRow(
        difficulty,
        (next) => {
          difficulty = next;
          report();
        },
        // A published tune keeps a difficulty, so there is nothing here to
        // offer a way of removing it with.
        level.status !== "published",
      );

      return [title.row, subtitle.row, instructions.row, stars, problem];
    },
  });
  if (!agreed) return false;

  const response = await fetch(`/api/tunes/${encodeURIComponent(level.id)}`, {
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
