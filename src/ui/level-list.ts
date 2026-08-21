/**
 * A list of levels, drawn as cards, with everything that can be done to one.
 *
 * Two pages hold one: the front page, which lists what is published and
 * offers nothing to anybody but an admin, and "my transcriptions", which lists
 * one author's drafts and published levels and offers the pencil, the move
 * across the line between the two, and the trash. Everything but which of
 * those a card carries is the same on both, so it lives here once, and the
 * page says only which page it is.
 *
 * Everything shown comes out of columns rather than out of a melody: neither
 * listing route reads that one, so the pitches are not merely absent from
 * these pages, they never left the database.
 */

import {
  createLocalProgressStore,
  type PlayProgress,
  type Storage,
} from "../puzzle/progress.js";
import type { UserSummary } from "../shared/session.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import { editDetails } from "./details-modal.js";
import { googleButton } from "./google-button.js";
import {
  cardPlan,
  countLeft,
  createLevelCard,
  type CardPage,
  type LevelCardOptions,
} from "./level-card.js";
import { readCompact, writeCompact } from "./level-density.js";
import { openLevelModal } from "./level-modal.js";
import { openModal } from "./modal.js";
import { createSwitch } from "./switch.js";

export type LevelListOptions = {
  elements: { list: HTMLElement; note: HTMLElement; controls: HTMLElement };
  /** Where progress and the compact preference are kept. */
  storage: Storage;
  /** Who is looking, once /api/me has said. */
  viewer: Promise<UserSummary | undefined>;
  page: CardPage;
};

export type LevelList = {
  /** Ask the server for the levels and draw them. */
  load(): Promise<void>;
};

const SOURCE: Record<CardPage, string> = {
  home: "/api/levels",
  mine: "/api/mine",
};

/** The sentence on a refused answer, or one about the status if it sent none. */
async function refusal(response: Response): Promise<string> {
  const said = (await response.json().catch(() => ({}))) as { error?: string };
  return said.error ?? `The server answered ${response.status}.`;
}

export function createLevelList(options: LevelListOptions): LevelList {
  const { list, note, controls } = options.elements;
  const { page, storage, viewer } = options;

  /**
   * What has been solved, on this machine.
   *
   * Local storage until there are accounts to file it under, which is why it
   * is read here rather than arriving with the levels: the server does not
   * know which of these the visitor has finished.
   */
  const store = createLocalProgressStore(storage);

  /**
   * The levels and what is known of them, kept so the list can be drawn again.
   *
   * Turning the pictures off is a change of drawing, not a change of facts, so
   * it rebuilds the cards from these rather than asking the server a second
   * question it has already answered.
   */
  let showing: { level: TranscriptionSummary; progress?: PlayProgress }[] = [];
  let compact = readCompact(storage);
  let user: UserSummary | undefined;

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
        writeCompact(storage, on);
        render();
      },
    }).element,
  );

  /** The list emptying is worth saying, or the page just goes blank. */
  function sayEmpty(): void {
    if (page === "home") {
      note.textContent = "No levels yet.";
      return;
    }
    const start = document.createElement("a");
    start.href = "/edit";
    start.textContent = "Start a transcription";
    note.replaceChildren("Nothing yet. ", start);
  }

  /** Your own list, with nobody signed in: the way to change that. */
  function askToSignIn(): void {
    const words = document.createElement("span");
    words.textContent = "Sign in to see your transcriptions.";
    note.replaceChildren(words, googleButton({ next: "/mine" }));
    note.classList.add("is-asking");
  }

  async function load(): Promise<void> {
    try {
      user = await viewer;
      const response = await fetch(SOURCE[page], {
        headers: { accept: "application/json" },
      });
      if (response.status === 401 && page === "mine") {
        list.replaceChildren();
        askToSignIn();
        return;
      }
      if (!response.ok) {
        throw new Error(await refusal(response));
      }
      const levels = (await response.json()) as TranscriptionSummary[];

      if (levels.length === 0) {
        showing = [];
        list.replaceChildren();
        sayEmpty();
        return;
      }

      // One read per level, all at once: the store is asynchronous because
      // the database version will be, and this is the shape that stays right
      // when it becomes one request instead of a hundred local reads.
      const progress = await Promise.all(
        levels.map((level) => store.read(level.id)),
      );

      showing = levels.map((level, at) => ({ level, progress: progress[at] }));
      render();
      note.textContent = "";
      note.classList.remove("is-asking");
    } catch (error) {
      // The sentence is the only thing on the page at this point, so it says
      // what happened rather than "something went wrong".
      note.textContent =
        error instanceof Error
          ? `The levels could not be loaded. ${error.message}`
          : "The levels could not be loaded.";
      console.error(error);
    }
  }

  /**
   * One card, wired to what this page lets the viewer do with it.
   *
   * The box's Play link reads "Resume" once a pitch has been written and "Play
   * again" once it has been solved, so both facts go in.
   */
  function cardFor(
    level: TranscriptionSummary,
    progress: PlayProgress | undefined,
  ): HTMLLIElement {
    const solvedAt = progress?.solvedAt;
    const started = (progress?.pitches.length ?? 0) > 0;
    const plan = cardPlan(level, user, page);

    const edit: LevelCardOptions["edit"] =
      plan.edit === "editor"
        ? { href: `/edit?level=${encodeURIComponent(level.id)}` }
        : plan.edit === "details"
          ? { run: () => void retitle(level) }
          : undefined;

    const publish: LevelCardOptions["publish"] =
      plan.publish === "publish"
        ? {
            label: "Publish",
            run: () => void publishLevel(level),
            // A level still missing pitches cannot be published; the server
            // says so too, but the button may as well say it first.
            blocked: level.unpitchedCount > 0 ? countLeft(level) : undefined,
          }
        : plan.publish === "unpublish"
          ? { label: "Unpublish", run: () => void unpublishLevel(level) }
          : undefined;

    return createLevelCard(level, {
      compact,
      draft: plan.draft,
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
      edit,
      publish,
      onDelete: plan.delete ? () => void removeLevel(level) : undefined,
    });
  }

  /** What to say when something could not be done to a level. */
  function complain(level: TranscriptionSummary, did: string, error: unknown): void {
    note.textContent =
      error instanceof Error
        ? `${level.title} could not be ${did}. ${error.message}`
        : `${level.title} could not be ${did}.`;
    console.error(error);
  }

  async function retitle(level: TranscriptionSummary): Promise<void> {
    try {
      if (await editDetails(level)) await load();
    } catch (error) {
      complain(level, "changed", error);
    }
  }

  /**
   * Across the line, one way or the other. The server is asked only after
   * the question, because the question is the point: publishing freezes the
   * music, and unpublishing loses every player's progress on it.
   */
  async function move(
    level: TranscriptionSummary,
    question: Parameters<typeof openModal>[0],
    action: "publish" | "unpublish",
  ): Promise<void> {
    const agreed = await openModal(question);
    if (!agreed) return;

    try {
      const response = await fetch(
        `/api/levels/${encodeURIComponent(level.id)}/${action}`,
        { method: "POST", headers: { accept: "application/json" } },
      );
      if (!response.ok) {
        throw new Error(await refusal(response));
      }
      await load();
    } catch (error) {
      complain(level, `${action}ed`, error);
    }
  }

  const publishLevel = (level: TranscriptionSummary) =>
    move(
      level,
      {
        title: "Publish this level?",
        body: [
          `“${level.title}” goes into the list for everybody to play.`,
          "The music and the timing marks freeze. Only the title, subtitle and instructions can change afterwards; unpublishing takes it back.",
        ],
        confirm: "Publish",
        cancel: "Not yet",
      },
      "publish",
    );

  const unpublishLevel = (level: TranscriptionSummary) =>
    move(
      level,
      {
        title: "Unpublish this level?",
        body: [
          `“${level.title}” leaves the list and becomes a draft again.`,
          "It gets a new address, and anybody's progress on it is lost.",
        ],
        confirm: "Unpublish",
        cancel: "Keep it up",
      },
      "unpublish",
    );

  /**
   * Ask, then throw the level away.
   *
   * The question is the one thing here that cannot be undone afterwards, and
   * it says so.
   */
  async function removeLevel(level: TranscriptionSummary): Promise<void> {
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
        throw new Error(await refusal(response));
      }
      await load();
    } catch (error) {
      complain(level, "deleted", error);
    }
  }

  return { load };
}
