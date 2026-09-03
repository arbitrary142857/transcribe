/**
 * The box that asks for assist mode, and the only way into it.
 *
 * It is a confirm dialog in shape — a question, what saying yes does, and two
 * buttons with the retreat focused first — and it is asked at all because the
 * two tools it opens are worth stopping over. Neither is a setting; both
 * change what the puzzle is, and one of them changes what the tune's box says
 * about your solve for ever after. Somebody should meet that before they meet
 * the tools, not after.
 *
 * The two buttons are drawn in the box, at the size and colour they have on
 * the page, beside the sentence that says what each does. A named control the
 * reader has to go and find is a worse explanation than a picture of the
 * control itself, and these are icon-only buttons whose whole face is the
 * picture.
 */

import { ASSIST_OFFER } from "./assist.js";
import { assistToolSample } from "./assist-tool.js";
import { notesHeardIcon, pianoHeardIcon } from "./icons.js";
import { openModal, type ModalLine } from "./modal.js";

/** One tool, drawn, with what it does beside it. */
function explain(sample: HTMLElement, said: string): ModalLine {
  const row = document.createElement("span");
  row.className = "assist-explains";

  const words = document.createElement("span");
  words.className = "assist-explains-words";
  words.textContent = said;

  row.append(sample, words);
  // The shell wraps each line in a paragraph of its own, so the row is handed
  // over as the single node that paragraph holds.
  return [row];
}

/**
 * Ask whether to activate assist mode. Resolves false on every way out but
 * the one button that means yes.
 *
 * The tools are drawn as they will be found — resting, not lit — because what
 * the reader has to do with this picture afterwards is recognise the button on
 * the page, and the page's is the resting one.
 */
export function openAssistModal(): Promise<boolean> {
  return openModal({
    className: "assist-modal",
    title: "Activate assist mode?",
    body: [
      "Activating assist mode will unlock these two buttons.",
      explain(
        assistToolSample(pianoHeardIcon(false), "Hear each pitch as it is set"),
        "Lets you hear the pitch of any key you click on the piano.",
      ),
      explain(
        assistToolSample(notesHeardIcon(false), "Hear the notes"),
        "Lets you hear your own transcription alongside the video.",
      ),
      "If you complete a tune using assist mode, your completion time will not be counted in public statistics. Once assist mode is activated for this tune, it cannot be deactivated.",
    ],
    confirm: ASSIST_OFFER,
    cancel: "Nevermind",
  });
}
