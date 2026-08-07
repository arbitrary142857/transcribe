/**
 * The level list.
 *
 * Everything shown comes out of columns rather than out of a melody: the
 * listing route never reads that one, so the pitches are not merely absent
 * from this page, they never left the database.
 */

import type { TranscriptionSummary } from "./shared/transcription.js";
import { createLevelCard } from "./ui/level-card.js";

const list = document.getElementById("levels")!;
const note = document.getElementById("levels-note")!;

async function load(): Promise<void> {
  try {
    const response = await fetch("/api/levels", {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`The server answered ${response.status}.`);
    }
    const levels = (await response.json()) as TranscriptionSummary[];

    if (levels.length === 0) {
      note.textContent = "No levels yet.";
      return;
    }
    list.replaceChildren(...levels.map(createLevelCard));
    note.textContent = "";
  } catch (error) {
    // Said plainly and left on the page: there is nothing to fall back to,
    // and an empty list would claim there are no levels rather than that we
    // could not find out.
    note.textContent =
      error instanceof Error
        ? `The levels could not be loaded. ${error.message}`
        : "The levels could not be loaded.";
    console.error(error);
  }
}

void load();
