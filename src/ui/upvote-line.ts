/**
 * The heart on a level: how many stand, and — for a solver who may — yours.
 *
 * Always an element, so the box always has the figure; what varies is
 * whether it presses. The gates for pressing are the upvote route's,
 * mirrored so the control never offers what the server would refuse:
 * signed in, sharing statistics, solved, not the author, published.
 * Everybody else gets the count alone.
 *
 * A press is the whole gesture — no save button, unlike the difficulty
 * proposal — because the heart filling in *is* the feedback, and pressing
 * again takes it back. The count moves with it, locally; the next listing
 * fetch is what makes it everybody's number.
 */

import type { UserSummary } from "../shared/session.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import { heartFillIcon, heartIcon } from "./icons.js";

const hearts = (count: number): string =>
  count === 1 ? "1 heart" : `${count} hearts`;

export function upvoteLine(options: {
  level: TranscriptionSummary;
  viewer: UserSummary | undefined;
  solved: boolean;
}): HTMLElement {
  const { level, viewer } = options;
  let count = level.upvoteCount ?? 0;

  const mayPress =
    viewer !== undefined &&
    viewer.shareStats &&
    options.solved &&
    level.status === "published" &&
    level.ownerId !== viewer.id;

  const glyph = document.createElement("span");
  glyph.className = "upvote-heart";
  glyph.setAttribute("aria-hidden", "true");

  const figure = document.createElement("span");
  figure.className = "upvote-count";
  figure.setAttribute("aria-hidden", "true");

  if (!mayPress) {
    const line = document.createElement("span");
    line.className = "upvote-line";
    line.setAttribute("role", "img");
    line.setAttribute("aria-label", hearts(count));
    line.title = hearts(count);
    glyph.innerHTML = heartIcon();
    figure.textContent = String(count);
    line.append(glyph, figure);
    return line;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "upvote-line is-live";
  button.append(glyph, figure);

  let upvoted = false;
  let sending = false;
  /** The server's last word against a press, worn as the title until the next. */
  let refusal: string | undefined;

  function draw(): void {
    glyph.innerHTML = upvoted ? heartFillIcon() : heartIcon();
    figure.textContent = String(count);
    button.setAttribute("aria-pressed", String(upvoted));
    button.classList.toggle("is-upvoted", upvoted);
    const label = upvoted ? "Take your heart back" : "Upvote this level";
    button.setAttribute("aria-label", `${label} (${hearts(count)})`);
    button.title = refusal ?? `${hearts(count)} — ${label.toLowerCase()}`;
  }

  const address = `/api/levels/${encodeURIComponent(level.id)}/upvote`;

  button.addEventListener("click", () => {
    if (sending) return;
    sending = true;
    refusal = undefined;
    const giving = !upvoted;
    void (async () => {
      try {
        const response = await fetch(address, {
          method: giving ? "PUT" : "DELETE",
          headers: { accept: "application/json" },
        });
        if (response.ok) {
          upvoted = giving;
          count += giving ? 1 : -1;
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
  // drawn — a late fill, like the difficulty proposal's.
  void (async () => {
    try {
      const response = await fetch(address, { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const said = (await response.json()) as { upvoted?: boolean };
      if (said.upvoted === true) {
        upvoted = true;
        draw();
      }
    } catch {
      // The count alone, then; a press still works.
    }
  })();

  draw();
  return button;
}
