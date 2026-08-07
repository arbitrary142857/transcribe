/**
 * One level, as it appears in the list.
 *
 * Every fact on a card comes out of its own column. The melody is not among
 * them and never was: the listing query names its columns and `melody` is not
 * one, so there is nothing here to remember to leave out. Once these are
 * puzzles, that is the difference between a level and its answer.
 */

import { keyForFifths } from "../music/key-signature.js";
import type { Accidental } from "../music/types.js";
import { beatsPerMinute, tempoMapOf } from "../playback/tempo-map.js";
import type { TranscriptionSummary } from "../shared/transcription.js";

/** Signs rather than letters, since a card is read and never typed into. */
const ACCIDENTAL_SIGN: Record<Accidental, string> = {
  [-2]: "\u{1D12B}",
  [-1]: "♭",
  0: "",
  1: "♯",
  2: "\u{1D12A}",
};

/** The key written the way it is spoken: `D♭ major`, `A minor`. */
export function keyName(level: TranscriptionSummary): string {
  const { tonic } = keyForFifths(level.keyFifths, level.keyMode);
  return `${tonic.letter}${ACCIDENTAL_SIGN[tonic.accidental]} ${level.keyMode}`;
}

/**
 * The line under the title, in the order it answers "is this one for me?":
 * what it is written in, how much of it there is, and how long it runs.
 *
 * The tempo is worked out rather than stored, because the two marks and the
 * bar count already say it -- one fewer column able to disagree with the rest.
 * It is the felt beat, so 6/8 counts two to the bar rather than six.
 *
 * Seconds rather than a timecode: these sections run half a minute, and `0:31`
 * is slower to read than `31s` for nothing gained.
 */
export function levelFacts(level: TranscriptionSummary): string {
  const map = tempoMapOf(
    { start: level.markStart, end: level.markEnd },
    level.measures,
    level.meter,
  );

  return [
    keyName(level),
    `${level.meter.beats}/${level.meter.beatUnit}`,
    level.measures === 1 ? "1 bar" : `${level.measures} bars`,
    // The database will not hold marks that describe no tempo, so this stands
    // against a row no route can currently write rather than against a level.
    map === undefined ? undefined : `${Math.round(beatsPerMinute(map))} BPM`,
    level.noteCount === 1 ? "1 note" : `${level.noteCount} notes`,
    `${Math.round(level.markEnd - level.markStart)}s`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

/**
 * Built from elements with their text set, never from markup.
 *
 * That is not house style for its own sake: a title is written by whoever
 * submitted it, and `textContent` shows one containing a script tag as those
 * characters rather than running it. Nothing on this page may become
 * innerHTML.
 *
 * Not a link yet. Opening a level means loading its melody into the editor,
 * and until that route exists a card that looked clickable would be a promise
 * the page could not keep.
 */
export function createLevelCard(level: TranscriptionSummary): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "level-card";

  const title = document.createElement("h2");
  title.className = "level-title";
  title.textContent = level.title;
  item.append(title);

  if (level.subtitle !== undefined) {
    const subtitle = document.createElement("p");
    subtitle.className = "level-subtitle";
    subtitle.textContent = level.subtitle;
    item.append(subtitle);
  }

  const facts = document.createElement("p");
  facts.className = "level-facts";
  facts.textContent = levelFacts(level);
  item.append(facts);

  return item;
}
