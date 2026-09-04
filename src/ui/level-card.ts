/**
 * One level, as it appears in the list.
 *
 * Every fact on a card comes out of its own column. The melody is not among
 * them and never was: the listing query names its columns and `melody` is not
 * one, so there is nothing here to remember to leave out. Once these are
 * puzzles, that is the difference between a level and its answer.
 */

import { displayedDifficulty } from "../shared/difficulty.js";
import { ADMIN, ANONYMOUS, type UserSummary } from "../shared/session.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import { createDifficulty, createUnratedDifficulty } from "./difficulty.js";
import { flagIcon, heartFillIcon, heartIcon, pencilIcon, trashIcon } from "./icons.js";
import { keyLabelOfFifths } from "./key-label.js";
import { lastEdited } from "./last-edited.js";
import type { StatusWord } from "./level-status.js";
import { pageTooltip } from "./tooltip.js";
import { THUMBNAIL_SIZE, sharpenThumbnail, thumbnailUrl } from "./youtube.js";

/** The key written the way it is spoken: `D♭ major`, `A minor`. */
export const keyName = (level: TranscriptionSummary): string =>
  keyLabelOfFifths(level.keyFifths, level.keyMode);

/** How to say a count of hearts, for labels wherever hearts are counted. */
export const heartsSaid = (count: number): string =>
  count === 1 ? "1 heart" : `${count} hearts`;

/** How to say a count of solvers, likewise. */
export const solversSaid = (count: number): string =>
  count === 1 ? "Solved by 1 player" : `Solved by ${count} players`;

/**
 * A small icon-and-number pair: the hearts on a level, the players who
 * solved it. Exported because the level's box prints the same figures the
 * card does, and the two must not drift.
 *
 * `kind` colours it — a heart is pink and a finishing flag is green — and is
 * the only thing that varies between them beyond the glyph.
 */
export function countFigure(
  icon: string,
  count: number,
  said: string,
  kind?: string,
): HTMLElement {
  const figure = document.createElement("span");
  figure.className = kind ? `level-figure level-figure-${kind}` : "level-figure";
  figure.setAttribute("role", "img");
  figure.setAttribute("aria-label", said);
  figure.title = said;

  const glyph = document.createElement("span");
  glyph.className = "level-figure-icon";
  glyph.setAttribute("aria-hidden", "true");
  glyph.innerHTML = icon;

  const number = document.createElement("span");
  number.className = "level-figure-count";
  number.setAttribute("aria-hidden", "true");
  number.textContent = String(count);

  figure.append(glyph, number);
  return figure;
}

/**
 * How much is left, for the tooltip on an unfinished tune's status.
 *
 * The status word reads "Unfinished"; what it hovers to say is the count,
 * rather than the same word again.
 */
export const countLeft = (level: TranscriptionSummary): string =>
  level.unpitchedCount === 1
    ? "1 note needs a pitch"
    : `${level.unpitchedCount} notes need pitches`;

/** Which list the card is in: everybody's, or the viewer's own. */
export type CardPage = "tunes" | "mine";

/**
 * What pressing a card does, or nothing at all.
 *
 * On the catalog it opens the level's box — the room to decide whether to
 * play something — and a level still missing pitches opens nothing, because
 * there is no complete answer to mark an attempt against and
 * `/api/tunes/:id/puzzle` refuses it for the same reason.
 *
 * On the author's own page a card is work rather than a puzzle, so it opens
 * the editor with no box in between, finished or not. The exception is a
 * published level, whose music is frozen: the editor could change nothing
 * about it, so its card opens the box like the catalog's.
 */
export type CardOpen = "box" | "editor";

export function cardOpening(
  level: TranscriptionSummary,
  page: CardPage,
): CardOpen | undefined {
  if (page === "mine") return level.status === "published" ? "box" : "editor";
  return level.unpitchedCount === 0 ? "box" : undefined;
}

/**
 * What a card shows and offers, decided before anything is drawn.
 *
 * Drawing, not permission: the server refuses a stranger's edit whatever a
 * card offered, so this decides only what is worth offering. On the front
 * page that is nothing, except to an admin, for whom it is the way to tidy
 * up: the pencil to the details box, Unpublish — the author's own Unpublish,
 * handing the level back to them as a draft under a new id — and the trash.
 * Never Publish there, because the catalog lists nothing that is not
 * published already. On your own page it is the pencil — into the editor
 * while a level is a draft, into the details box once it is published and
 * its music is frozen — the way across that line, and the trash.
 *
 * Every draft carries Publish, including one that cannot be published yet:
 * greyed, with `publishBlock` below as its reason. A button that is missing
 * explains nothing, and "why can I not publish this" is exactly the question
 * somebody looking at an unfinished draft is asking.
 */
export type CardPlan = {
  edit: "editor" | "details" | undefined;
  publish: "publish" | "unpublish" | undefined;
  delete: boolean;
};

export function cardPlan(
  level: TranscriptionSummary,
  viewer: UserSummary | undefined,
  page: CardPage,
): CardPlan {
  const nothing: CardPlan = { edit: undefined, publish: undefined, delete: false };
  if (viewer === undefined) return nothing;

  const theirs = viewer.isAdmin || viewer.id === level.ownerId;
  if (page === "tunes") {
    return viewer.isAdmin
      ? { edit: "details", publish: "unpublish", delete: true }
      : nothing;
  }
  if (!theirs) return nothing;
  if (level.status === "draft") {
    return { edit: "editor", publish: "publish", delete: true };
  }
  return { edit: "details", publish: "unpublish", delete: true };
}

/**
 * Why this draft cannot be published yet, or nothing if it can.
 *
 * Both conditions are the server's, said here first so the answer arrives
 * before the press rather than after it: the publish route refuses an
 * unfinished level and so does the table's own CHECK, and it refuses one with
 * no difficulty because every published level has to carry a figure for
 * solvers' ratings to lean on.
 *
 * The pitches come first when both are missing. It is the larger job by a
 * long way, and naming the difficulty first would send somebody to set one
 * only to be stopped again.
 */
export function publishBlock(level: TranscriptionSummary): string | undefined {
  if (level.unpitchedCount > 0) return "Transcribe all the pitches first!";
  if (level.authorDifficulty === undefined) return "Set a difficulty first!";
  return undefined;
}

/**
 * Who wrote a level down, and whether that is worth marking.
 *
 * Three cases and an order between them. The site's own levels say "Admin" —
 * the word rather than the account's name, since no account may be called
 * that (it is a reserved username) and the fact worth carrying is that this
 * one came from the site. Your own levels say your name, marked, so your work
 * is findable in a page of everybody's — Anonymous included, which is still
 * you. Everybody else is a name and nothing more.
 */
export type Byline = { name: string; mark: "admin" | "you" | undefined };

export function bylineOf(
  level: TranscriptionSummary,
  viewer: UserSummary | undefined,
): Byline {
  if (level.authorIsAdmin === true) return { name: ADMIN, mark: "admin" };
  const name = level.author ?? ANONYMOUS;
  return viewer !== undefined && viewer.id === level.ownerId
    ? { name, mark: "you" }
    : { name, mark: undefined };
}

/** What a card may be asked to do, beyond naming its level. */
export type LevelCardOptions = {
  /** The word at the top right, and what it hovers to explain. */
  status: StatusWord;
  statusTitle?: string;
  /**
   * Pressing the card: somewhere to go, or something to do here. Absent, and
   * the card is words alone — a level with no answer to play against.
   */
  open?: { href: string } | { run: () => void };
  /** The byline, on the page where a level might be anybody's. */
  byline?: Byline;
  /** When it was last touched, on the page where they are all yours. */
  editedAt?: number;
  /** Whether this viewer's heart stands on it, so the glyph is filled. */
  hearted?: boolean;
  /**
   * The pencil: somewhere to go, or something to do here. Absent, and the
   * card carries no pencil — which on the catalog is everybody but an
   * admin.
   */
  edit?: { href: string } | { run: () => void };
  /**
   * The small worded button that moves a level across the line between
   * draft and published. `blocked` greys it and is what it says when pressed
   * anyway.
   */
  publish?: { label: string; run: () => void; blocked?: string };
  /** Throw this level away. Absent, and the card carries no trash. */
  onDelete?: () => void;
  /**
   * Draw the card without its picture.
   *
   * A whole screen of stills is a lot of screen for what a card actually
   * says, and somebody working through the list wants to see more of it at
   * once. The picture is left out rather than hidden, so the sharper sizes are
   * never even asked for — see `sharpenThumbnail`, which probes up to four.
   */
  compact?: boolean;
};

/**
 * Say something above a control, rather than beside the pointer.
 *
 * The pointer is the right anchor for a refusal raised deep inside a click
 * handler; for a word about the thing under the pointer, the thing itself is
 * steadier — and it is the only anchor a keyboard has.
 */
function say(control: HTMLElement, message: string): void {
  const box = control.getBoundingClientRect();
  pageTooltip().say(message, { x: box.left + box.width / 2, y: box.top });
}

/**
 * Whether a card ends on the figures it has earned.
 *
 * Only a published tune has earned any, and a draft's are not merely zero but
 * unaskable: the rating and upvote routes refuse a tune that is not published,
 * and the solve count is over players who cannot reach it. So a draft's card
 * drawing "0 hearts, solved by 0 players" reports the result of a question
 * nobody has been asked — on your own work, on the one page that is all your
 * own work, which reads as a verdict rather than as a blank.
 *
 * Left out rather than zeroed. `.level-tools` is pushed right by its own
 * `margin-left: auto` and `.level-foot` carries a `min-height`, so a card
 * without the figures is exactly as tall as one with them and its tools do
 * not move.
 */
export const showsFigures = (
  level: Pick<TranscriptionSummary, "status">,
): boolean => level.status === "published";

/** The two glyph-and-number pairs a published card ends on. */
function figuresOf(level: TranscriptionSummary, hearted: boolean): HTMLElement {
  const figures = document.createElement("span");
  figures.className = "level-figures";
  const upvotes = level.upvoteCount ?? 0;
  const solvers = level.solveCount ?? 0;
  figures.append(
    countFigure(
      hearted ? heartFillIcon() : heartIcon(),
      upvotes,
      hearted ? `${heartsSaid(upvotes)}, yours among them` : heartsSaid(upvotes),
      "heart",
    ),
    countFigure(flagIcon(), solvers, solversSaid(solvers), "flag"),
  );
  return figures;
}

/**
 * Built from elements with their text set, never from markup.
 *
 * That is not house style for its own sake: a title is written by whoever
 * submitted it, and `textContent` shows one containing a script tag as those
 * characters rather than running it. Nothing on this page may become
 * innerHTML.
 *
 * Every card has the same five slots, whatever page it is on and whoever is
 * looking: the picture; a line with the difficulty at its left and where this
 * level has got to at its right; the title, one line, ellipsised; the
 * subtitle, when there is one; a line about the level — who wrote it down, or
 * when you last touched it; and, pinned to the bottom, the figures it has
 * earned and whatever this viewer may do to it. The last line is pinned
 * rather than stacked so that a card without a subtitle is exactly as tall as
 * one with a subtitle and its figures still line up across the row — which is
 * the whole of what keeps the grid even.
 *
 * The card opens something and the pencil opens the editor, and the two are
 * told apart the only way that keeps a keyboard and a screen reader working:
 * the title is the control, its `::after` is stretched over the whole card,
 * and the tools are raised above that. Nesting one inside the other would be
 * neither valid nor reachable by tab.
 */
export function createLevelCard(
  level: TranscriptionSummary,
  options: LevelCardOptions,
): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "level-card";
  if (options.compact) item.classList.add("is-compact");

  if (!options.compact) {
    // The video this was written down from, as a picture, in a box of its own.
    //
    // The box is what keeps the card's height honest. Sized in the markup as
    // well as the stylesheet so it is reserved before the picture lands, and
    // left standing when the picture never comes: a video taken down since would
    // otherwise take the whole 16:9 block out with it and leave that card
    // shorter than every other card on the page. The image is hidden and its
    // dark backing shows through, which reads as a video that is gone rather
    // than as a site that is broken.
    const frame = document.createElement("div");
    frame.className = "level-frame";

    const art = document.createElement("img");
    art.className = "level-art";
    art.src = thumbnailUrl(level.videoId);
    art.width = THUMBNAIL_SIZE.width;
    art.height = THUMBNAIL_SIZE.height;
    art.loading = "lazy";
    art.decoding = "async";
    art.alt = "";
    art.referrerPolicy = "no-referrer";
    art.addEventListener("error", () => {
      art.hidden = true;
    });
    sharpenThumbnail(art, level.videoId);
    frame.append(art);
    item.append(frame);
  }

  // The words, padded away from the edge — the picture above is not, so the
  // padding belongs to this rather than to the card.
  const body = document.createElement("div");
  body.className = "level-body";

  // The first line: how hard it is at the left, how far it has got at the
  // right. Both are short and neither wraps, so they never meet in the middle.
  const top = document.createElement("div");
  top.className = "level-top";
  const displayed = displayedDifficulty(level);
  top.append(
    displayed === undefined ? createUnratedDifficulty() : createDifficulty(displayed),
  );

  const status = document.createElement("span");
  status.className = `level-status is-${options.status.tone}`;
  status.textContent = options.status.text;
  if (options.statusTitle !== undefined) status.title = options.statusTitle;
  top.append(status);
  body.append(top);

  const title = document.createElement("h2");
  title.className = "level-title";

  if (options.open === undefined) {
    title.textContent = level.title;
  } else if ("href" in options.open) {
    // A real address — the editor — so it opens in a new tab like any link.
    const open = document.createElement("a");
    open.className = "level-open";
    open.href = options.open.href;
    open.textContent = level.title;
    title.append(open);
    item.classList.add("is-openable");
  } else {
    // A button rather than a link, because what it opens is a box on this page
    // rather than an address. The cost is that a level can no longer be opened
    // in a new tab from here; `/play?tune=…` is still a real address, and the
    // box is what leads to it.
    const { run } = options.open;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "level-open";
    open.textContent = level.title;
    open.addEventListener("click", run);
    title.append(open);
    item.classList.add("is-openable");
  }
  body.append(title);

  // Only when there is one. The bottom line is pinned to the foot of the card,
  // so the space a missing subtitle leaves falls between the lines rather than
  // shortening the card.
  if (level.subtitle !== undefined && level.subtitle !== "") {
    const subtitle = document.createElement("p");
    subtitle.className = "level-subtitle";
    subtitle.textContent = level.subtitle;
    body.append(subtitle);
  }

  if (options.byline !== undefined) {
    const line = document.createElement("p");
    line.className = "level-byline";
    const who = document.createElement("span");
    who.className =
      options.byline.mark === undefined
        ? "level-byline-name"
        : `level-byline-name is-${options.byline.mark}`;
    who.textContent = options.byline.name;
    line.append("Transcribed by ", who);
    body.append(line);
  }

  if (options.editedAt !== undefined) {
    const when = document.createElement("p");
    when.className = "level-when";
    when.textContent = lastEdited(options.editedAt, Date.now());
    body.append(when);
  }

  // The last line, always last: what the level has earned, and what may be
  // done to it. All of the tools are raised above the title's stretched
  // `::after` by `.level-tool`, or a press meant for one of them would open
  // the level instead.
  const foot = document.createElement("div");
  foot.className = "level-foot";
  if (showsFigures(level)) {
    foot.append(figuresOf(level, options.hearted === true));
  }

  const tools = document.createElement("div");
  tools.className = "level-tools";

  if (options.edit) {
    // A link where there is an address to go to, a button where there is a box
    // to open here: the same distinction the title draws.
    const edit =
      "href" in options.edit
        ? document.createElement("a")
        : document.createElement("button");
    edit.className = "level-tool level-edit";
    edit.title = "Edit";
    edit.setAttribute("aria-label", `Edit ${level.title}`);
    // The only innerHTML on this page, and it holds a constant from icons.ts —
    // never anything that came out of the database.
    edit.innerHTML = pencilIcon();
    if (edit instanceof HTMLAnchorElement && "href" in options.edit) {
      edit.href = options.edit.href;
    } else if (edit instanceof HTMLButtonElement && "run" in options.edit) {
      edit.type = "button";
      edit.addEventListener("click", options.edit.run);
    }
    tools.append(edit);
  }

  if (options.onDelete) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "level-tool level-delete";
    remove.title = "Delete";
    remove.setAttribute("aria-label", `Delete ${level.title}`);
    remove.innerHTML = trashIcon();
    remove.addEventListener("click", options.onDelete);
    tools.append(remove);
  }

  // Last of the three, and the only one that is a word: no icon says
  // "publish" plainly, and a lock would read as "locked".
  //
  // `aria-disabled` rather than `disabled`, with the press refused below.
  // A disabled button receives no mouse events at all, so it can be neither
  // pointed at nor asked anything — and the whole point of keeping this one
  // on a draft that cannot go is that it answers when you press it. The same
  // way round the editor's dead actions and the piano's dead keys work.
  if (options.publish) {
    const { label, run, blocked } = options.publish;
    const move = document.createElement("button");
    move.type = "button";
    move.className = "level-tool level-tool-text level-publish";
    move.textContent = label;
    move.setAttribute("aria-disabled", String(blocked !== undefined));
    move.addEventListener("click", (event) => {
      if (blocked !== undefined) {
        // Nothing else on the card may hear it either: the title's hit area
        // is stretched over the whole thing.
        event.preventDefault();
        say(move, blocked);
        return;
      }
      run();
    });

    if (blocked === undefined) {
      move.title = label;
    } else {
      // The page's own tooltip on hover rather than the browser's `title`,
      // which waits about a second before it says anything — long enough that
      // somebody has moved on before the answer arrives. No `title` at all
      // then, or both would show and the slow one would arrive second.
      move.addEventListener("pointerenter", () => say(move, blocked));
      move.addEventListener("pointerleave", () => pageTooltip().say(undefined));
      // A keyboard reaches it too: it is `aria-disabled`, not `disabled`, so
      // it still takes focus.
      move.addEventListener("focus", () => say(move, blocked));
      move.addEventListener("blur", () => pageTooltip().say(undefined));
    }
    tools.append(move);
  }

  if (tools.childElementCount > 0) foot.append(tools);
  body.append(foot);

  item.append(body);
  return item;
}
