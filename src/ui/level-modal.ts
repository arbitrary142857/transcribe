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
  lengthIcon,
  metronomeIcon,
  noteIcon,
} from "./icons.js";
import {
  keyName,
  levelStats,
  type LevelStat,
  type LevelStatKind,
} from "./level-card.js";
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
 * pictures that happen to sit together.
 */
const UNITS_PER_REM = 17;

export type LevelModalOptions = {
  /** Everything the box is about. */
  level: TranscriptionSummary;
  /** What the author wrote, if they wrote anything. */
  instructions: string | undefined;
  /** Offer a way in. Absent when the box is opened from inside the puzzle. */
  play?: boolean;
  /** How long it took, when it has been finished. */
  solvedIn?: { elapsedMs: number; checkCount: number };
};

export function openLevelModal(options: LevelModalOptions): void {
  const { level } = options;

  openInfoModal({
    className: "level-modal",
    fill(close: () => void) {
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

      const buttons = document.createElement("div");
      buttons.className = "modal-buttons";

      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "modal-cancel";
      dismiss.textContent = "Close";
      dismiss.addEventListener("click", close);
      buttons.append(dismiss);

      if (options.play) {
        const play = document.createElement("a");
        play.className = "modal-confirm level-modal-play";
        play.href = `/play?level=${encodeURIComponent(level.id)}`;
        play.textContent = options.solvedIn ? "Play again" : "Play";
        buttons.append(play);
      }

      parts.push(buttons);
      return parts;
    },
  });
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
  box.title = stat.label;

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
