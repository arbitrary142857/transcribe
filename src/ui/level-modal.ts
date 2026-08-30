/**
 * A level's own box: what it is made of, and what its author wants known.
 *
 * Opened two ways, and it is the same box both times. From the level list it
 * is how you decide whether to play something, so it carries a Play button.
 * From inside a puzzle it is the information button beside the title, where
 * Play would mean nothing — you are already here.
 *
 * The facts come from `levelStats`, which is what the card used to print as
 * one dot-separated line. A grid with a word over each number is worth the
 * room: "4/4" and "4 bars" and "120 BPM" are three different kinds of thing,
 * and a line of them separated by dots asks the reader to sort that out.
 */

import { NoteValue } from "../music/duration.js";
import { keyForFifths } from "../music/key-signature.js";
import {
  KEY_DIAGRAM_WIDTH,
  renderKeyDiagram,
} from "../render/key-diagram.js";
import { renderStaveDiagram } from "../render/stave-diagram.js";
import { formatElapsed } from "../puzzle/stopwatch.js";
import type { TranscriptionSummary } from "../shared/transcription.js";
import {
  barsIcon,
  flagIcon,
  lengthIcon,
  metronomeIcon,
  noteIcon,
} from "./icons.js";
import {
  countFigure,
  keyName,
  levelStats,
  solversSaid,
  type LevelStat,
  type LevelStatKind,
} from "./level-card.js";
import { displayedDifficulty } from "../shared/difficulty.js";
import { authorLabel } from "../shared/session.js";
import { createDifficulty } from "./difficulty.js";
import { openInfoModal } from "./modal.js";

/**
 * Room for the meter glyph and nothing else, and the ink around it.
 *
 * The same pair the setup page's meter chooser uses. Taking the *default*
 * headroom instead was what made this diagram enormous: the default reserves a
 * clef's worth above and below — 54 units of empty staff around a glyph 40
 * wide — and since the svg is drawn to whatever width its box gives it, that
 * tall, narrow view box came out over twice as high as the box was wide.
 */
const METER_WIDTH = 40;
const METER_HEADROOM = { above: 7, below: 7 };

/**
 * How many stave units go in a rem.
 *
 * Both diagrams are sized from this, so the key signature and the meter are
 * drawn at one scale and read as two views of the same stave rather than two
 * pictures that happen to sit together. Fewer units to the rem draws both
 * larger: at seventeen the two signatures were the smallest thing in a dialog
 * that exists to show them.
 */
const UNITS_PER_REM = 14;

export type LevelModalOptions = {
  /** Everything the box is about. */
  level: TranscriptionSummary;
  /** What the author wrote, if they wrote anything. */
  instructions: string | undefined;
  /** Offer a way in. Absent when the box is opened from inside the puzzle. */
  play?: boolean;
  /** How long it took, when it has been finished. */
  solvedIn?: { elapsedMs: number; checkCount: number };
  /**
   * Whether there is an attempt here to go back to.
   *
   * Separate from `solvedIn`, which is both the finished time and the fact of
   * being finished — a level can be neither started nor solved, started and not
   * solved, or solved, and the way in should say which.
   */
  started?: boolean;
  /**
   * The viewer's part in the figures: the rating prompt for a solver, the
   * author's note for the author. Built by `solvedContribution`; the box
   * stays dumb about who may say what.
   */
  contribute?: HTMLElement;
  /**
   * The heart, counted and — for a solver who may — pressable. Built by
   * `upvoteLine`, which decides which of the two it is.
   */
  upvote?: HTMLElement;
  /** The solving moment itself: a cheer above the solved line. */
  celebrate?: boolean;
  /**
   * Offer the ways onward — staying here, or the level list. Passed by the
   * play page, where the box opens over a finished puzzle; the catalog's
   * box offers Play instead.
   */
  wayOut?: boolean;
};

/** What the way in offers, given how far this level has got. */
function wayIn(options: LevelModalOptions): string {
  if (options.solvedIn) return "Play again";
  return options.started ? "Resume" : "Play";
}

export function openLevelModal(options: LevelModalOptions): void {
  const { level } = options;

  openInfoModal({
    className: "level-modal",
    // Nothing in here closes the box any more; the shell's × does, along with
    // Escape and the backdrop.
    fill(close) {
      const parts: Node[] = [];

      const heading = document.createElement("h2");
      heading.className = "modal-title";
      heading.textContent = level.title;
      parts.push(heading);

      if (level.subtitle !== undefined) {
        const subtitle = document.createElement("p");
        subtitle.className = "level-modal-subtitle";
        subtitle.textContent = level.subtitle;
        parts.push(subtitle);
      }

      // Who wrote it down, and how hard it is: the same two facts the card
      // leads with, since this box is the card opened. A draft without a
      // difficulty shows the byline alone, as its card does.
      const author = document.createElement("p");
      author.className = "level-modal-author";
      author.append(authorLabel(level.author));
      const displayed = displayedDifficulty(level);
      if (displayed !== undefined) {
        author.append(" · ", createDifficulty(displayed));
        if (level.ratingCount !== undefined) {
          // How much of the figure is the solvers': the one place the count
          // of ratings is shown.
          const count = document.createElement("span");
          count.className = "level-modal-ratings";
          count.textContent =
            level.ratingCount === 1
              ? " · from 1 rating"
              : ` · from ${level.ratingCount} ratings`;
          author.append(count);
        }
      }
      parts.push(author);

      // ---- how it has been received --------------------------------------
      //
      // The heart (counted, and pressable for a solver who may), the
      // solvers, and the two medians. The medians arrive after the box has
      // drawn, from /stats; until then — and whenever there are too few
      // qualifying solves to publish one — they are a dash.
      if (level.status === "published") {
        const figures = document.createElement("p");
        figures.className = "level-modal-figures";

        const solvers = level.solveCount ?? 0;
        figures.append(
          ...(options.upvote ? [options.upvote, " · "] : []),
          // The card's flag, not the tick this box used to draw: the two
          // print the same figure and should not be two different glyphs.
          countFigure(flagIcon(), solvers, solversSaid(solvers), "flag"),
        );

        const median = medianFigure("Median completion time", "median");
        const flawless = medianFigure("Median flawless completion time", "flawless");
        figures.append(" · ", median.element, " · ", flawless.element);
        parts.push(figures);

        void (async () => {
          try {
            const response = await fetch(
              `/api/levels/${encodeURIComponent(level.id)}/stats`,
              { headers: { accept: "application/json" } },
            );
            if (!response.ok) return;
            const said = (await response.json()) as {
              medianSolveMs?: number;
              medianFlawlessMs?: number;
            };
            median.show(said.medianSolveMs);
            flawless.show(said.medianFlawlessMs);
          } catch {
            // The dashes stand; they were the truth a moment ago too.
          }
        })();
      }

      if (options.celebrate && options.solvedIn) {
        const cheer = document.createElement("p");
        cheer.className = "level-modal-cheer";
        cheer.textContent = "Solved!";
        parts.push(cheer);
      }

      if (options.solvedIn) {
        const solved = document.createElement("p");
        solved.className = "level-modal-solved";
        const attempts =
          options.solvedIn.checkCount === 1
            ? "flawlessly"
            : `in ${options.solvedIn.checkCount} attempts`;
        solved.textContent = `Solved ${attempts} · ${formatElapsed(options.solvedIn.elapsedMs)}`;
        parts.push(solved);
      }

      if (options.contribute) {
        parts.push(options.contribute);
      }

      // ---- the two signatures, drawn rather than named -------------------
      //
      // Notation is quicker to recognise than to read: four sharps is a
      // picture where "E major" is a fact to recall. Both diagrams already
      // exist for the choosers that set them, so they are drawn the same way
      // here and cannot disagree with what the editor showed.
      //
      // Built as panels, like the key chooser's own cells, and set apart from
      // the measured facts below: these two say what the music *is*, the four
      // below say how much of it there is.

      const drawn = document.createElement("div");
      drawn.className = "level-drawn";

      const keyPanel = signaturePanel(
        "Key signature",
        KEY_DIAGRAM_WIDTH,
        (staff) =>
          renderKeyDiagram(
            staff,
            keyForFifths(level.keyFifths, level.keyMode),
            level.clef,
          ),
      );
      // The one chip here, because a signature of no accidentals is A minor as
      // readily as C major and the stave alone cannot say which.
      const mode = document.createElement("p");
      mode.className = "level-signature-name";
      mode.textContent = keyName(level);
      keyPanel.append(mode);

      const meterPanel = signaturePanel(
        "Time signature",
        METER_WIDTH,
        (staff) =>
          renderStaveDiagram(
            staff,
            METER_WIDTH,
            (stave) =>
              stave.addTimeSignature(
                `${level.meter.beats}/${level.meter.beatUnit}`,
              ),
            METER_HEADROOM,
          ),
      );

      drawn.append(keyPanel, meterPanel);
      parts.push(drawn);

      // ---- how much of it there is ---------------------------------------

      const grid = document.createElement("div");
      grid.className = "level-grid";
      for (const stat of levelStats(level)) {
        grid.append(statBox(stat));
      }
      parts.push(grid);

      // ---- what the author wants known ---------------------------------

      if (options.instructions !== undefined) {
        const heading = document.createElement("h3");
        heading.className = "level-instructions-heading";
        heading.textContent = "Instructions";

        const body = document.createElement("p");
        body.className = "level-instructions";
        // Set as text, with the line breaks kept by `white-space: pre-wrap` in
        // the stylesheet rather than by turning newlines into markup. A
        // disabled textarea would show the same characters but read as a
        // broken input rather than as something to be read.
        body.textContent = options.instructions;

        // A box of its own, so that instructions long enough to scroll scroll
        // inside something with an edge — text that simply ran out of room
        // partway down the modal would read as cut off rather than as scrollable.
        const boxed = document.createElement("div");
        boxed.className = "level-instructions-box";
        boxed.tabIndex = 0;
        boxed.append(body);

        parts.push(heading, boxed);
      }

      // ---- the way in ---------------------------------------------------

      // No Close button beside it. The × in the corner is the way out, and two
      // of those in one box asks which is which for no gain — the more so here,
      // where the other button is the thing you came to press. Opened from
      // inside the puzzle there is no way in either, so the row goes entirely
      // rather than standing empty.
      if (options.play) {
        const buttons = document.createElement("div");
        buttons.className = "modal-buttons";

        const play = document.createElement("a");
        play.className = "modal-confirm level-modal-play";
        play.href = `/play?level=${encodeURIComponent(level.id)}`;
        play.textContent = wayIn(options);
        buttons.append(play);
        parts.push(buttons);
      }

      // The ways onward from a finished puzzle: staying is closing the box,
      // and the level list is an address. Only ever instead of Play — the
      // page you would play on is the one underneath.
      if (options.wayOut) {
        const buttons = document.createElement("div");
        buttons.className = "modal-buttons";

        const stay = document.createElement("button");
        stay.type = "button";
        stay.className = "modal-cancel";
        stay.textContent = "Keep playing";
        stay.addEventListener("click", () => close());

        const away = document.createElement("a");
        away.className = "modal-confirm level-modal-play";
        away.href = "/";
        away.textContent = "Level select";

        buttons.append(stay, away);
        parts.push(buttons);
      }

      return parts;
    },
  });
}

/**
 * One labelled median, a dash until — and unless — the figure arrives.
 *
 * The dash is not a loading state alone: under the privacy floor the server
 * answers nothing on purpose, and the dash is what nothing looks like.
 */
function medianFigure(
  label: string,
  word: string,
): { element: HTMLElement; show(ms: number | undefined): void } {
  const element = document.createElement("span");
  element.className = "level-modal-median";
  element.title = label;

  const time = document.createElement("span");
  time.className = "level-modal-median-time";

  const draw = (ms: number | undefined): void => {
    const said = ms === undefined ? "—" : formatElapsed(ms);
    time.textContent = said;
    element.setAttribute("aria-label", `${label}: ${said}`);
  };

  element.append(`${word} `, time);
  draw(undefined);
  return { element, show: draw };
}

/**
 * A signature under its name, drawn on its own stave.
 *
 * A `.panel` like the key chooser's cells, because that is what these are —
 * one notation diagram with a word over it — and the two screens showing the
 * same thing should look like they are showing the same thing.
 */
function signaturePanel(
  heading: string,
  units: number,
  draw: (staff: HTMLElement) => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel level-signature";

  const label = document.createElement("p");
  label.className = "level-signature-heading";
  label.textContent = heading;

  const staff = document.createElement("div");
  staff.className = "level-stave";
  // Sized from the diagram's own width rather than left to fill the panel: the
  // svg draws to whatever room it is given, so a meter forty units wide and a
  // key signature a hundred and twenty-four would otherwise come out the same
  // size on the page and at wildly different scales.
  staff.style.width = `${units / UNITS_PER_REM}rem`;
  draw(staff);

  panel.append(label, staff);
  return panel;
}

/** Which icon stands for each fact. */
const STAT_ICON: Record<LevelStatKind, () => string> = {
  bars: barsIcon,
  notes: () => noteIcon(NoteValue.Quarter, 0),
  tempo: metronomeIcon,
  length: lengthIcon,
};

/**
 * One measured fact: an icon, a number, and what the number counts.
 *
 * The icon carries the meaning and the unit confirms it, which is what "4 bars"
 * says and what a bare "4" under the heading "Bars" did not — that heading
 * could as easily have meant which bar as how many.
 *
 * The icon is `aria-hidden` inside its own markup, so the label is what a
 * screen reader gets; it is on the box rather than read out twice.
 */
function statBox(stat: LevelStat): HTMLElement {
  const box = document.createElement("div");
  box.className = "level-stat";

  const icon = document.createElement("span");
  icon.className = "level-stat-icon";
  // Constants from icons.ts, never anything out of the database.
  icon.innerHTML = STAT_ICON[stat.kind]();

  const value = document.createElement("p");
  value.className = "level-stat-value";

  const number = document.createElement("span");
  number.className = "level-stat-number";
  number.textContent = stat.value;

  const unit = document.createElement("span");
  unit.className = "level-stat-unit";
  unit.textContent = stat.unit;

  value.append(number, unit);
  box.append(icon, value);
  box.setAttribute("aria-label", `${stat.label}: ${stat.value} ${stat.unit}`);
  return box;
}
