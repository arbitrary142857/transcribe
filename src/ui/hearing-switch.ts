import type { Hearing } from "../playback/playalong.js";

/**
 * What the section is heard as: the video, the transcription, or both.
 *
 * A row of its own rather than a seventh button in the transport, because three
 * labelled choices will not fit beside six icons in this column — and because
 * these are three positions of one setting rather than three things to press,
 * which is what a segmented switch says and a row of toggles does not.
 */
export function createHearingSwitch(
  onHearing: (hearing: Hearing) => void,
): { element: HTMLElement; update(hearing: Hearing, timed: boolean): void } {
  const element = document.createElement("div");
  element.className = "mode-switch panel-switch hearing-switch";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", "What you hear");

  const options = (
    [
      ["Video", "video"],
      ["Both", "both"],
      ["Notes", "notes"],
    ] as const
  ).map(([label, hearing]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-option";
    button.textContent = label;
    button.addEventListener("click", () => onHearing(hearing));
    element.append(button);
    return { button, hearing };
  });

  return {
    element,
    update(hearing, timed) {
      for (const option of options) {
        const on = option.hearing === hearing;
        option.button.setAttribute("aria-pressed", String(on));
        option.button.classList.toggle("is-on", on);
        // Nothing to play without a tempo: the notes have no seconds to fall on.
        option.button.disabled = !timed && option.hearing !== "video";
      }
    },
  };
}

