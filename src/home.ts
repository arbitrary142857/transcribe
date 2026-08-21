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
import { readCompact, writeCompact } from "./ui/level-density.js";
import { openLevelModal } from "./ui/level-modal.js";
import { openModal } from "./ui/modal.js";
import { mountSessionNav } from "./ui/session-nav.js";
import { createSwitch } from "./ui/switch.js";

const list = document.getElementById("levels")!;
const note = document.getElementById("levels-note")!;
const controls = document.getElementById("levels-controls")!;

mountSessionNav(document.getElementById("session-nav")!);

/**
 * What has been solved, on this machine.
 *
 * Local storage until there are accounts to file it under, which is why it is
 * read here rather than arriving with the levels: the server does not know who
 * is asking, so it cannot say which of these are finished.
 */
const store = createLocalProgressStore(window.localStorage);

/**
 * The levels and what is known of them, kept so the list can be drawn again.
 *
 * Turning the pictures off is a change of drawing, not a change of facts, so it
 * rebuilds the cards from these rather than asking the server a second question
 * it has already answered.
 */
let showing: { level: TranscriptionSummary; progress?: PlayProgress }[] = [];
let compact = readCompact(window.localStorage);

function render(): void {
  list.classList.toggle("is-compact", compact);
  list.replaceChildren(
    ...showing.map((each) => cardFor(each.level, each.progress)),
  );
}

controls.append(
  createSwitch({
    label: "Compact",
    title: "Hide the pictures and fit more levels on the screen",
    checked: compact,
    onChange(on) {
      compact = on;
      writeCompact(window.localStorage, on);
      render();
    },
  }).element,
);

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

    showing = levels.map((level, at) => ({ level, progress: progress[at] }));
    render();
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
  // Started means there are pitches saved to come back to — not merely that a
  // record exists. The play page writes one whenever the tab is hidden, so
  // opening a level and switching away leaves a record with nothing in it, and
  // calling that "Resume" would promise work that was never done.
  const started = (progress?.pitches.length ?? 0) > 0;
  const card: HTMLLIElement = createLevelCard(level, {
    compact,
    solved: solvedAt !== undefined,
    onOpen: () =>
      openLevelModal({
        level,
        instructions: level.instructions,
        play: true,
        started,
        solvedIn:
          solvedAt === undefined || progress === undefined
            ? undefined
            : {
                elapsedMs: progress.elapsedMs,
                checkCount: progress.checkCount,
              },
      }),
    onDelete: () => void remove(level, card),
  });
  return card;
}

/**
 * Throw a level away, having asked first.
 *
 * A workbench tool for now, so it is as plain as it can be: no undo, no
 * optimistic removal, and a failure said in the same line the loading trouble
 * is said in. The one thing it does spend a step on is the asking, because
 * there is nothing on this page that puts a level back.
 */
async function remove(
  level: TranscriptionSummary,
  card: HTMLLIElement,
): Promise<void> {
  const agreed = await openModal({
    title: "Delete this level?",
    body: [
      `“${level.title}” will be removed from the database.`,
      "This cannot be undone.",
    ],
    confirm: "Delete",
    cancel: "Keep",
  });
  if (!agreed) return;

  try {
    const response = await fetch(`/api/levels/${encodeURIComponent(level.id)}`, {
      method: "DELETE",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      const said = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(said.error ?? `The server answered ${response.status}.`);
    }
  } catch (error) {
    note.textContent =
      error instanceof Error
        ? `${level.title} could not be deleted. ${error.message}`
        : `${level.title} could not be deleted.`;
    console.error(error);
    return;
  }

  // Out of the list the cards are drawn from as well as off the screen, or
  // turning the pictures on and off would bring it back.
  showing = showing.filter((each) => each.level.id !== level.id);
  card.remove();
  // The list emptying is worth saying, or the page just goes blank.
  note.textContent = showing.length === 0 ? "No levels yet." : "";
}

void load();
