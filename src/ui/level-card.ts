/**
 * One level, as it appears in the list.
 *
 * Every fact on a card comes out of its own column. The melody is not among
 * them and never was: the listing query names its columns and `melody` is not
 * one, so there is nothing here to remember to leave out. Once these are
 * puzzles, that is the difference between a level and its answer.
 */

import { beatsPerMinute, tempoMapOf } from "../playback/tempo-map.js";
import { displayedDifficulty } from "../shared/difficulty.js";
import { authorLabel, type UserSummary } from "../shared/session.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import { createDifficulty } from "./difficulty.js";
import { pencilIcon, trashIcon } from "./icons.js";
import { keyLabelOfFifths } from "./key-label.js";
import { THUMBNAIL_SIZE, sharpenThumbnail, thumbnailUrl } from "./youtube.js";

/** The key written the way it is spoken: `D♭ major`, `A minor`. */
export const keyName = (level: TranscriptionSummary): string =>
  keyLabelOfFifths(level.keyFifths, level.keyMode);

/** Which fact this is, so the box beside it can pick an icon. */
export type LevelStatKind = "bars" | "notes" | "tempo" | "length";

/** One measured fact about a level, in the parts its own box prints. */
export type LevelStat = {
  kind: LevelStatKind;
  /** For a screen reader and a tooltip, where the icon says nothing. */
  label: string;
  /** The number, set large. */
  value: string;
  /** What the number counts, set small beside it. */
  unit: string;
};

/**
 * How much of a level there is, and how long it runs.
 *
 * The number and its unit come apart because the box sets them at different
 * sizes: "4" large and "bars" small is one fact read at a glance, where a bare
 * "4" under the heading "Bars" left the reader to work out that the heading
 * meant *how many*.
 *
 * The key and the meter are not here. They are notation, and the box draws
 * them rather than naming them — a signature is quicker to recognise than a
 * phrase is to read.
 *
 * The tempo is worked out rather than stored, because the two marks and the
 * bar count already say it -- one fewer column able to disagree with the rest.
 * It is the felt beat, so 6/8 counts two to the bar rather than six.
 *
 * Seconds rather than a timecode: these sections run half a minute, and `0:31`
 * is slower to read than `31 sec` for nothing gained.
 */
export function levelStats(level: TranscriptionSummary): LevelStat[] {
  const map = tempoMapOf(
    { start: level.markStart, end: level.markEnd },
    level.measures,
    level.meter,
  );

  return [
    {
      kind: "bars",
      label: "Bars",
      value: String(level.measures),
      unit: level.measures === 1 ? "bar" : "bars",
    },
    {
      kind: "notes",
      label: "Notes",
      value: String(level.noteCount),
      unit: level.noteCount === 1 ? "note" : "notes",
    },
    // The database will not hold marks that describe no tempo, so this stands
    // against a row no route can currently write rather than against a level.
    ...(map === undefined
      ? []
      : ([
          {
            kind: "tempo",
            label: "Tempo",
            value: String(Math.round(beatsPerMinute(map))),
            unit: "BPM",
          },
        ] as const)),
    {
      kind: "length",
      label: "Length",
      value: String(Math.round(level.markEnd - level.markStart)),
      unit: "sec",
    },
  ];
}

/**
 * What is still missing, or nothing if the answer is complete.
 *
 * Read off a column rather than out of the melody, which is the whole reason
 * the column exists: the listing cannot open the answer to find out whether it
 * is finished. Finished is the ordinary case and says nothing — a card only
 * speaks up when there is work left.
 */
export function levelState(level: TranscriptionSummary): string | undefined {
  if (level.unpitchedCount === 0) return undefined;
  return level.unpitchedCount === 1
    ? "Unfinished · 1 note needs a pitch"
    : `Unfinished · ${level.unpitchedCount} notes need pitches`;
}

/**
 * How much is left, without the word the badge already carries.
 *
 * The badge reads "Unfinished"; its tooltip should add the count rather than
 * say the same word again.
 */
export const countLeft = (level: TranscriptionSummary): string =>
  level.unpitchedCount === 1
    ? "1 note needs a pitch"
    : `${level.unpitchedCount} notes need pitches`;

/** Which list the card is in: everybody's, or the viewer's own. */
export type CardPage = "home" | "mine";

/**
 * What a card shows and offers, decided before anything is drawn.
 *
 * Drawing, not permission: the server refuses a stranger's edit whatever a
 * card offered, so this decides only what is worth offering. On the front
 * page that is nothing, except to an admin, for whom it is the way to tidy
 * up: the pencil to the details box, Unpublish — the author's own Unpublish,
 * handing the level back to them as a draft under a new id — and the trash.
 * Never Publish there, because the front page lists nothing that is not
 * published already. On your own page it is the pencil — into the editor
 * while a level is a draft, into the details box once it is published and
 * its music is frozen — the way across that line, and the trash.
 */
export type CardPlan = {
  /** Say so on the card: this is nobody's but the author's yet. */
  draft: boolean;
  edit: "editor" | "details" | undefined;
  publish: "publish" | "unpublish" | undefined;
  delete: boolean;
};

export function cardPlan(
  level: TranscriptionSummary,
  viewer: UserSummary | undefined,
  page: CardPage,
): CardPlan {
  const draft = level.status === "draft";
  const nothing: CardPlan = { draft, edit: undefined, publish: undefined, delete: false };
  if (viewer === undefined) return nothing;

  const theirs = viewer.isAdmin || viewer.id === level.ownerId;
  if (page === "home") {
    return viewer.isAdmin
      ? { draft, edit: "details", publish: "unpublish", delete: true }
      : nothing;
  }
  if (!theirs) return nothing;
  return draft
    ? { draft, edit: "editor", publish: "publish", delete: true }
    : { draft, edit: "details", publish: "unpublish", delete: true };
}

/** What a card may be asked to do, beyond opening its box. */
export type LevelCardOptions = {
  solved: boolean;
  /** Mark it as a draft: the author's alone, for now. */
  draft?: boolean;
  onOpen: () => void;
  /**
   * The pencil: somewhere to go, or something to do here. Absent, and the
   * card carries no pencil — which on the front page is everybody but an
   * admin.
   */
  edit?: { href: string } | { run: () => void };
  /**
   * The small worded button that moves a level across the line between
   * draft and published. `blocked` draws it greyed, and says why.
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
 * Built from elements with their text set, never from markup.
 *
 * That is not house style for its own sake: a title is written by whoever
 * submitted it, and `textContent` shows one containing a script tag as those
 * characters rather than running it. Nothing on this page may become
 * innerHTML.
 *
 * A card carries the least that distinguishes one level from another — what it
 * is called, who wrote it down, how hard they say it is, and whether you have
 * finished it. Everything else it used to print in a row of dot-separated
 * facts is in the level's own box now, one press away, where there is room
 * to lay it out and to say what each number means.
 *
 * Every card has the same shape, whoever is looking: the picture, then a row
 * with the difficulty at its left and the tools at its right (the tools are
 * absent for everybody but an author or an admin, and the row keeps its
 * height without them), then the title, the subtitle, and a byline. The
 * byline always says somebody — "by Anonymous" when the author has no name
 * to show — so no card is a different height for having a quieter author.
 *
 * The card opens that box and the pencil opens the editor, and the two are
 * told apart the only way that keeps a keyboard and a screen reader working:
 * the title is the control, its `::after` is stretched over the whole card,
 * and the pencil is raised above that. Nesting one inside the other would be
 * neither valid nor reachable by tab.
 *
 * A level still missing pitches does not open a box at all. There is no
 * complete answer to mark an attempt against, which is the same thing
 * `/api/levels/:id/puzzle` says by refusing it — so the pencil is the only way
 * in, and the card already says why.
 */
export function createLevelCard(
  level: TranscriptionSummary,
  options: LevelCardOptions,
): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "level-card";
  if (options.compact) item.classList.add("is-compact");
  if (options.solved) item.classList.add("is-solved");
  if (options.draft) item.classList.add("is-draft");

  // What has become of this level. Over the picture where there is one, and on
  // the subtitle's line where there is not — never on the title's, which is held
  // to two lines and is the one thing on the card long enough to want them.
  const badges: HTMLElement[] = [];
  const badge = (kind: string, text: string, why: string): void => {
    const span = document.createElement("span");
    span.className = `level-badge level-badge-${kind}`;
    if (options.compact) span.classList.add("level-badge-inline");
    span.textContent = text;
    span.title = why;
    badges.push(span);
  };

  // Draft first, because it is the fact about the level that changes what the
  // rest mean. The ✓ has to leave the title anyway — see `.level-open` below.
  if (options.draft) badge("draft", "Draft", "Only you can see this level");
  if (options.solved) badge("solved", "✓", "Solved");
  if (levelState(level) !== undefined) {
    badge("unfinished", "Unfinished", countLeft(level));
  }

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

    // In a row of their own rather than each pinned to the corner, or a
    // draft's ✓ would sit on top of its "Draft".
    if (badges.length > 0) {
      const row = document.createElement("div");
      row.className = "level-badges";
      row.append(...badges);
      frame.append(row);
    }

    item.append(frame);
  }

  // The row above the title: how hard the level is, and what this viewer may
  // do to it. The difficulty comes through `displayedDifficulty`, which is
  // the only thing that knows what the figure is made of. Nothing is drawn
  // for a draft without one; the row's min-height keeps the card's shape.
  const row = document.createElement("div");
  row.className = "level-row";
  const displayed = displayedDifficulty(level);
  if (displayed !== undefined) {
    row.append(createDifficulty(displayed));
  }

  const head = document.createElement("div");
  head.className = "level-head";

  const title = document.createElement("h2");
  title.className = "level-title";

  if (level.unpitchedCount === 0) {
    // A button rather than a link, because what it opens is a box on this page
    // rather than an address. The cost is that a level can no longer be opened
    // in a new tab from here; `/play?level=…` is still a real address, and the
    // box is what leads to it.
    //
    // The two-line clamp lives on this, not on the heading around it. A button
    // is an inline-block, so the heading saw a single line box — the button —
    // and clamping it at two clamped nothing at all, which is how a title of a
    // hundred characters came to run down the whole page.
    const open = document.createElement("button");
    open.type = "button";
    open.className = "level-open";
    open.textContent = level.title;
    open.addEventListener("click", options.onOpen);
    title.append(open);
    item.classList.add("is-playable");
  } else {
    title.textContent = level.title;
  }

  // All raised above the title's stretched `::after` by `.level-tool`, and
  // grouped so that the gap between them is theirs rather than the head's.
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

  if (options.publish) {
    const { label, run, blocked } = options.publish;
    const move = document.createElement("button");
    move.type = "button";
    move.className = "level-tool level-tool-text level-publish";
    move.textContent = label;
    move.disabled = blocked !== undefined;
    move.title = blocked ?? label;
    move.addEventListener("click", run);
    tools.append(move);
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

  if (tools.childElementCount > 0) row.append(tools);
  head.append(title);

  // The words, padded away from the edge — the picture above is not, so the
  // padding belongs to this rather than to the card.
  const body = document.createElement("div");
  body.className = "level-body";
  body.append(row, head);

  // Always drawn, empty or not. The slot is one line tall either way, so a
  // level with no subtitle makes a card exactly as tall as one with a subtitle
  // — which is the whole of what keeps the grid even.
  const subtitle = document.createElement("p");
  subtitle.className = "level-subtitle";
  subtitle.textContent = level.subtitle ?? "";

  if (options.compact) {
    // The badges share this line rather than the title's. The title is two
    // lines, fixed, and it is the field somebody can put a hundred characters
    // in; a pill beside it would be squeezed out by exactly the level that
    // most needs to say it is unfinished. This line is its own row, so the
    // title cannot reach it, and the subtitle gives way to the badge rather
    // than the other way round.
    const note = document.createElement("div");
    note.className = "level-note";
    note.append(subtitle, ...badges);
    body.append(note);
  } else {
    body.append(subtitle);
  }

  // Who wrote it down, last. Always a line, always somebody.
  const author = document.createElement("p");
  author.className = "level-author";
  author.textContent = authorLabel(level.author);
  body.append(author);

  item.append(body);
  return item;
}
