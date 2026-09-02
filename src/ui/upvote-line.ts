/**
 * The heart on a tune, for a solver who may give one.
 *
 * Only the pressable half lives here now. The *count* is the box's, printed
 * once in its bottom corner beside the finishers, because two numbers for one
 * fact in one box drift the moment either is pressed — so this carries a word
 * rather than a figure, and tells the box when to move the number.
 *
 * The gates for pressing are the upvote route's, mirrored in `maySpeak` so the
 * control never offers what the server would refuse. Whoever may not press
 * simply gets nothing; the count in the corner is there for everybody.
 *
 * A press is the whole gesture — no save button — because the heart filling in
 * *is* the feedback, and pressing again takes it back.
 */

import type { TranscriptionSummary } from "../shared/transcription.js";
import { heartFillIcon, heartIcon } from "./icons.js";

export function likeButton(options: {
  level: TranscriptionSummary;
  /** Told when a heart lands or is taken back, so the count can follow. */
  onChange: (move: 1 | -1) => void;
}): HTMLElement {
  const { level } = options;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "like-button";

  const glyph = document.createElement("span");
  glyph.className = "like-heart";
  glyph.setAttribute("aria-hidden", "true");

  const word = document.createElement("span");
  word.className = "like-word";

  button.append(glyph, word);

  let liked = false;
  let sending = false;
  /** The server's last word against a press, worn as the title until the next. */
  let refusal: string | undefined;

  function draw(): void {
    glyph.innerHTML = liked ? heartFillIcon() : heartIcon();
    word.textContent = liked ? "Liked" : "Like";
    button.setAttribute("aria-pressed", String(liked));
    button.classList.toggle("is-liked", liked);
    button.title = refusal ?? (liked ? "Take your heart back" : "Give this tune a heart");
    button.setAttribute("aria-label", button.title);
  }

  const address = `/api/tunes/${encodeURIComponent(level.id)}/upvote`;

  button.addEventListener("click", () => {
    if (sending) return;
    sending = true;
    refusal = undefined;
    const giving = !liked;
    void (async () => {
      try {
        const response = await fetch(address, {
          method: giving ? "PUT" : "DELETE",
          headers: { accept: "application/json" },
        });
        if (response.ok) {
          liked = giving;
          options.onChange(giving ? 1 : -1);
        } else {
          const said = (await response.json().catch(() => ({}))) as { error?: string };
          refusal = said.error ?? `The server answered ${response.status}.`;
        }
      } catch {
        refusal = "The heart could not be sent.";
      } finally {
        sending = false;
        draw();
      }
    })();
  });

  // Whether this account's heart already stands, arriving after the box has
  // drawn. It moves no count: the figure the listing gave already holds it.
  void (async () => {
    try {
      const response = await fetch(address, { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const said = (await response.json()) as { upvoted?: boolean };
      if (said.upvoted === true) {
        liked = true;
        draw();
      }
    } catch {
      // Hollow, then; a press still works and still says which way it went.
    }
  })();

  draw();
  return button;
}
