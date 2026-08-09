/**
 * The level list.
 *
 * Everything shown comes out of columns rather than out of a melody: the
 * listing route never reads that one, so the pitches are not merely absent
 * from this page, they never left the database.
 */

import {
  createLocalProgressStore,
  type PlayProgress,
} from "./puzzle/progress.js";
import type { TranscriptionSummary } from "./shared/transcription.js";
import { createLevelCard } from "./ui/level-card.js";
import { openLevelModal } from "./ui/level-modal.js";

const list = document.getElementById("levels")!;
const note = document.getElementById("levels-note")!;

/**
 * What has been solved, on this machine.
 *
 * Local storage until there are accounts to file it under, which is why it is
 * read here rather than arriving with the levels: the server does not know who
 * is asking, so it cannot say which of these are finished.
 */
const store = createLocalProgressStore(window.localStorage);

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

    // One read per level, all at once: the store is asynchronous because the
    // database version will be, and this is the shape that stays right when it
    // becomes one request instead of a hundred local reads.
    const progress = await Promise.all(
      levels.map((level) => store.read(level.id)),
    );

    list.replaceChildren(
      ...levels.map((level, at) => cardFor(level, progress[at])),
    );
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

/**
 * One card, and the box it opens.
 *
 * The card is deliberately thin — a name and whether you have finished it —
 * and everything else about the level is in the box, where there is room to
 * lay it out and to print what the author wrote.
 */
function cardFor(
  level: TranscriptionSummary,
  progress: PlayProgress | undefined,
): HTMLLIElement {
  const solvedAt = progress?.solvedAt;
  return createLevelCard(level, {
    solved: solvedAt !== undefined,
    onOpen: () =>
      openLevelModal({
        level,
        instructions: level.instructions,
        play: true,
        solvedIn:
          solvedAt === undefined || progress === undefined
            ? undefined
            : {
                elapsedMs: progress.elapsedMs,
                checkCount: progress.checkCount,
              },
      }),
  });
}

void load();
