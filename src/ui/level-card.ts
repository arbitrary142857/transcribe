/**
 * One level, as it appears in the list.
 *
 * Every fact on a card comes out of its own column. The melody is not among
 * them and never was: the listing query names its columns and `melody` is not
 * one, so there is nothing here to remember to leave out. Once these are
 * puzzles, that is the difference between a level and its answer.
 */

import { beatsPerMinute, tempoMapOf } from "../playback/tempo-map.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
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

/**
 * Built from elements with their text set, never from markup.
 *
 * That is not house style for its own sake: a title is written by whoever
 * submitted it, and `textContent` shows one containing a script tag as those
 * characters rather than running it. Nothing on this page may become
 * innerHTML.
 *
 * A card carries the least that distinguishes one level from another — what it
 * is called, and whether you have finished it. Everything else it used to
 * print in a row of dot-separated facts is in the level's own box now, one
 * press away, where there is room to lay it out and to say what each number
 * means.
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
  options: {
    solved: boolean;
    onOpen: () => void;
    /**
     * Throw this level away, if there is anywhere to throw it.
     *
     * A workbench tool while there is no ownership and no way to get a level
     * back — see the route it calls. Absent, and the card carries no such
     * button at all.
     */
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
  },
): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "level-card";
  if (options.compact) item.classList.add("is-compact");
  if (options.solved) item.classList.add("is-solved");

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

  // The ✓ has to leave the title anyway — see `.level-open` below.
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
    frame.append(art, ...badges);

    item.append(frame);
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

  const edit = document.createElement("a");
  edit.className = "level-tool level-edit";
  edit.href = `/edit?level=${encodeURIComponent(level.id)}`;
  edit.title = "Edit";
  edit.setAttribute("aria-label", `Edit ${level.title}`);
  // The only innerHTML on this page, and it holds a constant from icons.ts —
  // never anything that came out of the database.
  edit.innerHTML = pencilIcon();

  // Both raised above the title's stretched `::after` by `.level-tool`, and
  // grouped so that the gap between them is theirs rather than the head's.
  const tools = document.createElement("div");
  tools.className = "level-tools";
  tools.append(edit);

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

  head.append(title, tools);

  // The words, padded away from the edge — the picture above is not, so the
  // padding belongs to this rather than to the card.
  const body = document.createElement("div");
  body.className = "level-body";
  body.append(head);

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

  item.append(body);
  return item;
}
