/**
 * A list of levels, drawn as cards, with everything that can be done to one.
 *
 * Two pages hold one: the catalog at /tunes, which lists what is published and
 * offers nothing to anybody but an admin (for whom every card carries the
 * pencil, Unpublish and the trash — the site's moderation, such as it is),
 * and "my tunes", which lists one author's drafts and published
 * levels and offers the pencil, the move across the line between the two,
 * and the trash. Everything but which of those a card carries is the same on
 * both, so it lives here once, and the page says only which page it is.
 *
 * What differs beyond the tools is what a card is *for*. On the catalog it is
 * a puzzle: it says how far you have got, who wrote it down, and it opens the
 * level's box. On the author's page it is work: it says how far *it* has got,
 * when you last touched it, and it opens the editor — no box in between,
 * because there is nothing to decide about your own draft. A published level
 * is the exception, its music frozen, and its card opens the box like the
 * catalog's.
 *
 * Everything shown comes out of columns rather than out of a melody: neither
 * listing route reads that one, so the pitches are not merely absent from
 * these pages, they never left the database.
 */

import { progressStoreFor } from "../puzzle/account-progress.js";
import {
  createLocalProgressStore,
  type ListableStorage,
  type PlayProgress,
  type ProgressStore,
} from "../puzzle/progress.js";
import type { UserSummary } from "../shared/session.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import { editDetails } from "./details-modal.js";
import { googleButton } from "./google-button.js";
import {
  bylineOf,
  cardOpening,
  cardPlan,
  countLeft,
  createLevelCard,
  publishBlock,
  type CardPage,
  type LevelCardOptions,
} from "./level-card.js";
import { readCompact, writeCompact } from "./level-density.js";
import {
  ALL_WORK_STATUSES,
  WHOLE_CATALOG,
  catalogEmptySentence,
  filterCatalog,
  filterWork,
  workEmptySentence,
  type CatalogFilter,
  type Chosen,
  type WorkBucket,
} from "./level-filter.js";
import { createCatalogFilters, createWorkFilters } from "./level-filters.js";
import { openLevelModal } from "./level-modal.js";
import { playStatus, workStatus } from "./level-status.js";
import { openModal } from "./modal.js";
import { browserFetch } from "./page-boot.js";
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
  tunes: "/api/tunes",
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
  let filter: CatalogFilter = WHOLE_CATALOG;
  let work: Chosen<WorkBucket> = ALL_WORK_STATUSES;
  let user: UserSummary | undefined;

  /**
   * Which levels this account's heart stands on. Empty for somebody signed
   * out, who has none — and the two cuts that read it then cut nothing.
   */
  let hearted: ReadonlySet<string> = new Set();

  /**
   * What this browser still holds from before somebody signed in — only ever
   * on the catalog, with somebody signed in, and only while records remain.
   * The standing line under the list offers them.
   */

  function render(): void {
    list.classList.toggle("is-compact", compact);
    const shown =
      page === "tunes"
        ? filterCatalog(showing, filter, { hearted, viewerId: user?.id })
        : filterWork(showing, work);
    list.replaceChildren(
      ...shown.map((each) => cardFor(each.level, each.progress)),
    );
    if (showing.length === 0) {
      sayEmpty();
    } else if (shown.length === 0) {
      const why =
        page === "tunes" ? catalogEmptySentence(filter) : workEmptySentence(work);
      say(why ?? "");
    } else {
      say("");
    }
  }

  /**
   * The controls above the list, drawn once the server has said who is
   * looking — two of the catalog's cuts are about the viewer's own doings and
   * are not offered to nobody. Redrawn from scratch on every load, so a card
   * publishing or being thrown away cannot leave two of anything behind.
   */
  function drawControls(): void {
    const parts: HTMLElement[] = [];
    if (page === "tunes") {
      parts.push(
        createCatalogFilters({
          filter,
          signedIn: user !== undefined,
          onChange(next) {
            filter = next;
            render();
          },
        }).element,
      );
    } else {
      parts.push(
        createWorkFilters({
          statuses: work,
          onChange(next) {
            work = next;
            render();
          },
        }).element,
      );
    }

    parts.push(
      createSwitch({
        label: "Compact View",
        title: "Hide the pictures and fit more tunes on the screen",
        checked: compact,
        onChange(on) {
          compact = on;
          writeCompact(storage, on);
          render();
        },
      }).element,
    );

    controls.replaceChildren(...parts);
  }

  /**
   * The sentence about the list, and nothing else.
   *
   * It used to carry two standing lines as well: one offering this browser's
   * signed-out progress to the account, and one on your own page saying the
   * name on your bylines was picked for you. Both are gone from here, along
   * with the question that used to open on arrival. Neither was about the list
   * somebody came to read, and both appeared in the first moments after
   * signing in — which is the worst time to be told a thing, because it is the
   * one moment the reader is looking for something else.
   *
   * Both live on the profile page now, where somebody has gone *to* settle
   * things about their account: the browser's progress is a row with Merge
   * Progress and Forget It in it, and the name is the field at the top. They
   * are discovered rather than announced.
   */
  function drawNote(sentence: readonly (Node | string)[]): void {
    note.classList.remove("is-asking");
    note.replaceChildren(...sentence);
  }

  const say = (text: string): void => drawNote(text === "" ? [] : [text]);

  /** The list emptying is worth saying, or the page just goes blank. */
  function sayEmpty(): void {
    if (page === "tunes") {
      say("No tunes yet.");
      return;
    }
    const start = document.createElement("a");
    start.href = "/edit";
    start.textContent = "Start a tune";
    drawNote(["Nothing yet. ", start]);
  }

  /** Your own list, with nobody signed in: the way to change that. */
  function askToSignIn(): void {
    const words = document.createElement("span");
    words.textContent = "Sign in to see your tunes.";
    note.replaceChildren(words, googleButton({ next: "/mine" }));
    note.classList.add("is-asking");
  }

  /**
   * The levels this account has hearted, in one question asked beside the
   * listing. A refusal or a fall is no hearts rather than no list: the cards
   * simply draw their hearts hollow.
   */
  async function readHearts(): Promise<ReadonlySet<string>> {
    if (user === undefined) return new Set();
    try {
      const response = await fetch("/api/me/upvotes", {
        headers: { accept: "application/json" },
      });
      if (!response.ok) return new Set();
      const said = (await response.json()) as { levels?: unknown };
      const levels = Array.isArray(said.levels) ? said.levels : [];
      return new Set(levels.filter((id): id is string => typeof id === "string"));
    } catch {
      return new Set();
    }
  }

  async function load(): Promise<void> {
    try {
      user = await viewer;
      store = progressStoreFor(user, { fetch: browserFetch, local });

      // The question about this account's hearts is asked while the levels are
      // on their way.
      const [response, hearts] = await Promise.all([
        fetch(SOURCE[page], { headers: { accept: "application/json" } }),
        readHearts(),
      ]);
      if (response.status === 401 && page === "mine") {
        list.replaceChildren();
        controls.replaceChildren();
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
      hearted = hearts;

      drawControls();
      render();
    } catch (error) {
      // The sentence is the only thing on the page at this point, so it says
      // what happened rather than "something went wrong".
      say(
        error instanceof Error
          ? `The tunes could not be loaded. ${error.message}`
          : "The tunes could not be loaded.",
      );
      console.error(error);
    }
  }

  /** The tune's own box, as a card opens it. */
  function openBox(
    level: TranscriptionSummary,
    progress: PlayProgress | undefined,
  ): void {
    openLevelModal({
      level,
      instructions: level.instructions,
      page,
      opening: "browse",
      viewer: user,
      progress,
      // The author's door: the same details box the pencil opens, with the
      // same refresh behind it.
      onEditDetails: () => void retitle(level),
    });
  }

  /**
   * One card, wired to what this page lets the viewer do with it.
   *
   * The progress goes to the box as well as to the status word: the way in
   * reads "Start", "Continue" or "View Tune" by how far it has got.
   */
  function cardFor(
    level: TranscriptionSummary,
    progress: PlayProgress | undefined,
  ): HTMLLIElement {
    const plan = cardPlan(level, user, page);
    const opening = cardOpening(level, page);
    const editing = `/edit?tune=${encodeURIComponent(level.id)}`;

    const open: LevelCardOptions["open"] =
      opening === "editor"
        ? { href: editing }
        : opening === "box"
          ? { run: () => openBox(level, progress) }
          : undefined;

    const edit: LevelCardOptions["edit"] =
      plan.edit === "editor"
        ? { href: editing }
        : plan.edit === "details"
          ? { run: () => void retitle(level) }
          : undefined;

    const publish: LevelCardOptions["publish"] =
      plan.publish === "publish"
        ? {
            label: "Publish",
            run: () => void publishLevel(level),
            // The server refuses a draft that is unfinished or unrated; the
            // button says which of the two it is before anybody waits for a
            // refusal. See `publishBlock`.
            blocked: publishBlock(level),
          }
        : plan.publish === "unpublish"
          ? { label: "Unpublish", run: () => void unpublishLevel(level) }
          : undefined;

    return createLevelCard(level, {
      compact,
      status: page === "tunes" ? playStatus(progress) : workStatus(level),
      statusTitle:
        page === "mine" && level.unpitchedCount > 0 ? countLeft(level) : undefined,
      byline: page === "tunes" ? bylineOf(level, user) : undefined,
      editedAt: page === "mine" ? level.updatedAt : undefined,
      hearted: hearted.has(level.id),
      open,
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
        `/api/tunes/${encodeURIComponent(level.id)}/${action}`,
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
        title: "Publish this tune?",
        body: [
          `“${level.title}” will become viewable to all users.`,
          // "its music" rather than a list of what the music is made of: the
          // server compares the whole encoded melody, so the key signature and
          // the meter are frozen alongside the rhythms and the pitches, and a
          // list that named only those two would be a promise the save breaks.
          // "Start and End" are what the timing panel calls the two marks.
          "While it is published, its music and its Start and End marks become uneditable. You will only be able to edit its title, subtitle, instructions, and difficulty.",
          // The round trip is lossy, and this is where somebody deciding to
          // publish can still take that into account. See `unpublishLevel`,
          // which is where it actually happens.
          "You may unpublish it at any time, but doing so will permanently delete every player's progress, difficulty rating, and upvote status on this tune."
        ],
        confirm: "Publish",
        cancel: "Do Not Publish",
      },
      "publish",
    );

  const unpublishLevel = (level: TranscriptionSummary) =>
    move(
      level,
      {
        title: "Unpublish this tune?",
        body: [
          `“${level.title}” will become a draft again.`,
          // The consequence rather than the mechanism. The draft really does
          // get a new id — that is the whole point of the route, so that old
          // progress cannot meet new music — but what an author needs to know
          // is that the address they may have shared stops working.
          "It will get a new address, so any existing links to it will stop working.",
          // All three, because the unpublish route deletes all three in one
          // batch: the progress, the ratings and the upvotes. Saying only
          // "progress" left the two an author would most miss unmentioned.
          "Every player's progress on it, every difficulty rating, and every upvote will be permanently deleted. This cannot be undone."
        ],
        confirm: "Unpublish",
        cancel: "Keep Published",
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
      title: "Delete this tune?",
      body: [
        `“${level.title}” will be removed from the database.`,
        "This cannot be undone.",
      ],
      confirm: "Delete",
      cancel: "Keep",
    });
    if (!agreed) return;

    try {
      const response = await fetch(`/api/tunes/${encodeURIComponent(level.id)}`, {
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
