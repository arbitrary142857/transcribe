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

import { progressStoreFor } from "../puzzle/account-progress.js";
import { mergeIntoAccount } from "../puzzle/handoff.js";
import {
  createLocalProgressStore,
  type ListableStorage,
  type PlayProgress,
  type ProgressStore,
} from "../puzzle/progress.js";
import { ANONYMOUS, type UserSummary } from "../shared/session.js";
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
import {
  FILTERS,
  emptyFilterSentence,
  filterLevels,
  type ProgressFilter,
} from "./level-filter.js";
import { openLevelModal } from "./level-modal.js";
import {
  createHandoffLine,
  offerMergeOnArrival,
  offerToForget,
} from "./merge-offer.js";
import { openModal } from "./modal.js";
import { browserFetch } from "./page-boot.js";
import { createSegmented } from "./segmented.js";
import { createSwitch } from "./switch.js";

export type LevelListOptions = {
  elements: { list: HTMLElement; note: HTMLElement; controls: HTMLElement };
  /** Where this browser's progress and the compact preference are kept. */
  storage: ListableStorage;
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
   * Where the visitor's progress is kept: this browser's records for whoever
   * is signed out, the account's for whoever is signed in. Which one is known
   * only once /api/me has answered, so `store` is settled in `load`.
   */
  const local = createLocalProgressStore(storage);
  let store: ProgressStore = local;

  /**
   * The levels and what is known of them, kept so the list can be drawn again.
   *
   * Turning the pictures off, or choosing a filter, is a change of drawing,
   * not a change of facts, so it rebuilds the cards from these rather than
   * asking the server a second question it has already answered.
   */
  let showing: { level: TranscriptionSummary; progress?: PlayProgress }[] = [];
  let compact = readCompact(storage);
  let filter: ProgressFilter = "all";
  let user: UserSummary | undefined;

  /**
   * What this browser still holds from before somebody signed in — only ever
   * on the front page, with somebody signed in, and only while records remain.
   * The standing line under the list offers them.
   */
  let held: PlayProgress[] = [];

  function render(): void {
    list.classList.toggle("is-compact", compact);
    const shown = filterLevels(showing, filter);
    list.replaceChildren(
      ...shown.map((each) => cardFor(each.level, each.progress)),
    );
    if (showing.length === 0) {
      sayEmpty();
    } else {
      say(shown.length === 0 ? (emptyFilterSentence(filter) ?? "") : "");
    }
  }

  // The filter is the front page's: "my transcriptions" is a list of work,
  // not of puzzles, and solved-ness means little there.
  if (page === "home") {
    const which = createSegmented({
      label: "Which levels to show",
      choices: FILTERS,
      value: filter,
      onChange(next) {
        filter = next;
        render();
      },
    });
    which.element.classList.add("level-filter");
    controls.append(which.element);
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

  /**
   * The sentence about the list, and under it the line about this browser's
   * records when there is one. Everything the note says goes through here, so
   * the line is never lost under a later sentence.
   */
  function drawNote(sentence: readonly (Node | string)[]): void {
    note.classList.remove("is-asking");
    const parts: (Node | string)[] = [...sentence];
    if (held.length > 0) {
      parts.push(
        createHandoffLine({
          count: held.length,
          onBringIn: () => void bringIn(),
          onForget: () => void forget(),
        }),
      );
    }
    // On the author's own page, while their name is one the site picked:
    // every card here says it, so this is where to say it was picked.
    if (page === "mine" && user !== undefined && !user.choseUsername) {
      parts.push(pickedNameLine(user));
    }
    note.replaceChildren(...parts);
  }

  const say = (text: string): void => drawNote(text === "" ? [] : [text]);

  /** The list emptying is worth saying, or the page just goes blank. */
  function sayEmpty(): void {
    if (page === "home") {
      say("No levels yet.");
      return;
    }
    const start = document.createElement("a");
    start.href = "/edit";
    start.textContent = "Start a transcription";
    drawNote(["Nothing yet. ", start]);
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
      store = progressStoreFor(user, { fetch: browserFetch, local });

      // The question about this browser's records is asked while the levels
      // are on their way, and settled before their progress is read, so the
      // list opens showing what was just brought in.
      const [response, trouble] = await Promise.all([
        fetch(SOURCE[page], { headers: { accept: "application/json" } }),
        page === "home"
          ? offerMergeOnArrival({ user, storage, local, fetch: browserFetch })
          : undefined,
      ]);
      if (response.status === 401 && page === "mine") {
        list.replaceChildren();
        askToSignIn();
        return;
      }
      if (!response.ok) {
        throw new Error(await refusal(response));
      }
      const levels = (await response.json()) as TranscriptionSummary[];

      // One question for every level at once: a single request for an
      // account, one local read per level for a browser.
      const progress = await store.readMany(levels.map((level) => level.id));
      showing = levels.map((level) => ({ level, progress: progress.get(level.id) }));
      held = page === "home" && user !== undefined ? await local.readAll() : [];

      render();
      if (trouble !== undefined) say(trouble);
    } catch (error) {
      // The sentence is the only thing on the page at this point, so it says
      // what happened rather than "something went wrong".
      say(
        error instanceof Error
          ? `The levels could not be loaded. ${error.message}`
          : "The levels could not be loaded.",
      );
      console.error(error);
    }
  }

  /** One line, once: the name on these cards was picked, and where to change it. */
  function pickedNameLine(who: UserSummary): HTMLElement {
    const line = document.createElement("span");
    line.className = "note-handoff";
    const choose = document.createElement("a");
    choose.href = "/account";
    choose.className = "note-action";
    choose.textContent = "Choose your own";
    line.append(`Your levels say by ${who.username ?? ANONYMOUS}, a name picked for you. `, choose);
    return line;
  }

  /** The standing line's first way out: the records go to the account, and the list is read again. */
  async function bringIn(): Promise<void> {
    const outcome = await mergeIntoAccount({ fetch: browserFetch, local, records: held });
    if ("trouble" in outcome) {
      say(outcome.trouble);
      return;
    }
    await load();
  }

  /** The other way out: the records are dropped, behind the question. */
  async function forget(): Promise<void> {
    if (await offerToForget(local, held)) {
      held = [];
      render();
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
    say(
      error instanceof Error
        ? `${level.title} could not be ${did}. ${error.message}`
        : `${level.title} could not be ${did}.`,
    );
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
          "The music and the timing marks freeze. Only the title, subtitle, instructions and difficulty can change afterwards; unpublishing takes it back.",
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
