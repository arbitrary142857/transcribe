/**
 * Playing a level.
 *
 * The rhythm arrives written down and every note but the first is waiting for
 * a pitch. The work is to find them by ear against the video, and Check is the
 * only thing that knows whether you have.
 *
 * The melody this page holds is not the answer and never was: `/puzzle` took
 * every pitch but one out of it before it left the server. What is here is a
 * question, and the only route that can answer it returns verdicts and counts.
 */

import { decode } from "../editor/codec.js";
import { createHistory, type History } from "../editor/history.js";
import type { Melody } from "../music/melody.js";
import { Rest } from "../music/note-event.js";
import { spellForMelodyEvent } from "../music/spelling.js";
import type { PlayProgress, ProgressStore } from "../puzzle/progress.js";
import {
  pauseStopwatch,
  readStopwatch,
  resumeStopwatch,
  startedStopwatch,
  type Stopwatch,
} from "../puzzle/stopwatch.js";
import {
  attemptOf,
  judgedOf,
  rememberVerdicts,
  verdictsFrom,
  checkProblem,
  marksOf,
  verdictsOf,
  type Verdicts,
} from "../puzzle/verdicts.js";
import {
  firstSoundingNote,
  type TranscriptionRecord,
} from "../shared/transcription.js";
import { createEditor, type Editor, type EditorElements } from "./editor.js";
import { keepingScroll } from "./score-overlay.js";
import { createScoreEffects, EFFECT_MS } from "./score-effects.js";
import { openLevelModal } from "./level-modal.js";
import { createPlayBar, type PlayBar } from "./play-bar.js";
import { createPlayback, type Playback } from "./playback.js";
import { isTypingTarget } from "./typing-guard.js";
import { mountVideoPanel } from "./video-panel.js";

export type PlayPageElements = EditorElements & {
  bar: HTMLElement;
  video: HTMLElement;
  playbackControls: HTMLElement;
  scoreArea: HTMLElement;
};

/** How often the clock redraws. It is read from wall time, so it cannot drift. */
const TICK_MS = 500;

/**
 * How long after the last edit progress is written.
 *
 * Local storage would not mind being written on every keypress. The store it
 * becomes will, and the debounce is easier to put in now than at the point it
 * is making a request per notehead.
 */
const SAVE_AFTER_MS = 400;

export function createPlayPage(
  elements: PlayPageElements,
  level: { id: string; record: TranscriptionRecord },
  store: ProgressStore,
  restored: PlayProgress | undefined,
): void {
  const { record } = level;
  /**
   * Replaced outright by undo and redo, never edited into place.
   *
   * A pitch-only edit cannot change how many events there are, so every index
   * here — `given`, the verdicts, the selection — survives the swap. What does
   * not survive being edited in place is a tied run: writing one member's
   * pitch while its neighbour still holds the old one makes the tie briefly
   * impossible, and `setEvent` drops a tie it cannot honour rather than
   * remembering it for later.
   */
  let melody: Melody = decode(record.melody);

  /**
   * The note the puzzle gave away.
   *
   * The whole tied run, because that is what was revealed — see
   * `puzzleMelodyOf`. Drawn found from the first moment and never editable: it
   * was not anybody's to find.
   */
  const given: ReadonlySet<number> = new Set(firstSoundingNote(melody) ?? []);

  let verdicts: Verdicts = new Map();
  let checkCount = restored?.checkCount ?? 0;
  let solved = false;
  let checking = false;
  let report: string | undefined;

  let editor: Editor | undefined;
  let playback: Playback | undefined;
  let bar: PlayBar | undefined;
  /**
   * Whether the piano sounds as pitches are set.
   *
   * Off at the start of every puzzle, and not remembered between them: hearing
   * the pitches is a way of solving one, and turning it on for a level says
   * nothing about the next. Held here rather than in the editor, which `mount`
   * rebuilds from nothing on every edit.
   */
  let sound = false;

  // ---- what was left here last time --------------------------------------

  /**
   * Put back the pitches a previous visit had written.
   *
   * Guarded rather than trusted: the record is the player's own local storage,
   * and the level may have been edited since — an index past the end, or one
   * that is now a rest, is simply skipped. A puzzle that opens with one note
   * missing is better than one that does not open.
   */
  function restorePitches(pitches: readonly { index: number; midi: number }[]) {
    for (const { index, midi } of pitches) {
      if (index >= melody.eventCount) continue;
      if (given.has(index)) continue;
      if (melody.getEvent(index) instanceof Rest) continue;
      melody.setPitch(index, spellForMelodyEvent(melody, index, midi));
    }
  }

  if (restored) {
    restorePitches(restored.pitches);
    // Every verdict any check has given, so the stave opens coloured as it was
    // left — and so the notes already found open locked, which is the same set.
    verdicts = verdictsFrom(restored.judged);
    if (restored.solvedAt !== undefined) {
      // Solved on a previous visit. Every note it holds was confirmed by the
      // server then, so they are marked as the verdicts they earned -- keyed
      // by value like any other, which is what keeps them honest.
      const attempt = attemptOf(melody);
      verdicts = rememberVerdicts(
        verdicts,
        verdictsOf(
          attempt,
          [...attempt.keys()].map((index) => ({ index, correct: true })),
        ),
      );
      solved = true;
    }
  }

  let history: History = createHistory(melody);

  // ---- the clock ---------------------------------------------------------

  let watch: Stopwatch = startedStopwatch(
    restored?.elapsedMs ?? 0,
    performance.now(),
  );
  /** Frozen at the solve, so the clock stops where it stopped. */
  let finalMs: number | undefined =
    solved && restored ? restored.elapsedMs : undefined;

  const elapsed = (): number =>
    finalMs ?? readStopwatch(watch, performance.now());

  if (solved) {
    watch = pauseStopwatch(watch, performance.now());
  }

  const onVisibility = () => {
    if (solved) return;
    watch =
      document.visibilityState === "hidden"
        ? pauseStopwatch(watch, performance.now())
        : resumeStopwatch(watch, performance.now());
    save();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const ticker = setInterval(() => {
    if (solved) return;
    showBar();
  }, TICK_MS);

  // ---- keeping the place -------------------------------------------------

  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const progressNow = (): PlayProgress => ({
    levelId: level.id,
    elapsedMs: elapsed(),
    checkCount,
    solvedAt: solved ? (restored?.solvedAt ?? Date.now()) : undefined,
    pitches: [...attemptOf(melody)].map(([index, midi]) => ({ index, midi })),
    judged: judgedOf(verdicts),
  });

  function save(): void {
    // Failure is the store's to swallow: a note being entered is not the
    // moment to interrupt anybody about local storage being full.
    void store.write(progressNow());
  }

  function saveSoon(): void {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_AFTER_MS);
  }

  // ---- the score ---------------------------------------------------------

  const marks = () => marksOf(melody, verdicts, given);

  function showBar(): void {
    bar?.update({
      title: record.title,
      subtitle: record.subtitle,
      key: melody.keySignature,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      elapsedMs: elapsed(),
      checkCount,
      checkProblem: solved ? undefined : checkProblem(melody),
      checking,
      report,
      solved,
    });
  }

  function mount(): void {
    // Wrapped whole: tearing the score down collapses the document, and the
    // browser throws the scroll offset away with it — see `keepingScroll`.
    keepingScroll(rebuild);
  }

  function rebuild(): void {
    const selected = editor?.selection();
    editor?.destroy();
    showBar();
    // Told before the editor draws, so the first score it hands over is read
    // against the melody it belongs to.
    playback?.follow(melody);

    editor = createEditor(melody, elements, {
      clef: record.clef,
      // The rhythm is the level's. Nothing here writes durations, ties or
      // rests, and this is what takes those controls off the page.
      pitchOnly: true,
      sound,
      onSound: (next) => {
        sound = next;
      },
      initialSelection: selected,
      locked: () => (solved ? everything : marks().locked),
      decorate: () => {
        const { correct, wrong } = marks();
        return { correct, wrong };
      },
      onEdit: () => {
        history.record(melody);
        // Handed over again, or the notes played along with the video would be
        // the ones this page was opened with: the rig holds them in video
        // seconds, which is a reading of the melody rather than a view of it,
        // and only whoever owns the melody knows it has moved.
        playback?.follow(melody);
        // A pitch changed, so a verdict about the old one no longer applies.
        // Nothing has to be cleared: marksOf() reads the melody afresh.
        report = undefined;
        showBar();
        saveSoon();
      },
      onRender: (rendered) => {
        playback?.onScore(rendered);
        effects.onScore(rendered);
      },
      onSelect: (index) => playback?.onSelect(index),
    });
  }

  /** Once it is solved nothing is anybody's to change, the given note included. */
  const everything: ReadonlySet<number> = new Set(
    Array.from({ length: melody.eventCount }, (_unused, index) => index),
  );

  /** Take on a melody that arrived whole, from undo or redo. */
  function step(next: Melody | undefined): void {
    if (!next || solved) return;
    melody = next;
    report = undefined;
    mount();
    saveSoon();
  }

  // ---- checking ----------------------------------------------------------

  const effects = createScoreEffects(elements.scoreArea);

  async function check(): Promise<void> {
    if (checking || solved || checkProblem(melody) !== undefined) return;
    checking = true;
    report = undefined;
    showBar();

    const attempt = attemptOf(melody);
    try {
      const response = await fetch(`/api/levels/${level.id}/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pitches: [...attempt].map(([index, midi]) => ({ index, midi })),
        }),
      });
      if (!response.ok) {
        const said = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(said.error ?? `The server answered ${response.status}.`);
      }

      const answered = (await response.json()) as {
        verdicts: { index: number; correct: boolean }[];
        correct: number;
        total: number;
        solved: boolean;
      };

      // Taken before the new verdicts land, so "newly found" can be told from
      // "found ten minutes ago". Only the new ones celebrate; without this,
      // every check would set off the whole green half of the score again.
      const alreadyFound = marks().correct;

      // Added to, not replaced: a note told twice that it is wrong was told
    // about two different pitches, and going back to the first one should not
    // need a third check to be marked again.
    verdicts = rememberVerdicts(verdicts, verdictsOf(attempt, answered.verdicts));
      checkCount += 1;

      if (answered.solved) {
        solved = true;
        watch = pauseStopwatch(watch, performance.now());
        finalMs = readStopwatch(watch, performance.now());
        report = undefined;
      } else {
        const missed = answered.total - answered.correct;
        report =
          missed === 1
            ? "1 note is not right yet."
            : `${missed} notes are not right yet.`;
      }

      // A check settles what it found, and found notes are locked -- so an undo
      // reaching back past this point could restore a melody in which a locked
      // note has no pitch. Starting the history here is what makes that
      // impossible. Everything still open stays open, and a wrong note is
      // rewritten rather than undone, which is how this editor works anyway.
      history = createHistory(melody);
      checking = false;
      mount();

      // After `mount()`, which throws the drawn score away and builds another:
      // the groups the shake runs on have to be the ones now on the page.
      const settled = marks();
      editor?.holdStill(EFFECT_MS);
      effects.play({
        shake: settled.wrong,
        burst: [...settled.correct].filter((index) => !alreadyFound.has(index)),
      });

      save();
    } catch (error) {
      checking = false;
      report =
        error instanceof Error
          ? `It could not be checked. ${error.message}`
          : "It could not be checked.";
      showBar();
      console.error(error);
    }
  }

  // ---- the video ---------------------------------------------------------

  const iframe = mountVideoPanel(elements.video, record.videoId);
  playback = createPlayback(
    { panel: elements.playbackControls, scoreArea: elements.scoreArea },
    iframe,
    {
      marks: { start: record.markStart, end: record.markEnd },
      measures: record.measures,
      meter: record.meter,
    },
    () => editor?.selection(),
    // The marks are part of the level here rather than part of the work, so
    // there is no timing panel and no way to move them. Moving them would move
    // where every note falls, which is most of the answer.
    { canRetime: false },
  );

  // ---- the bar -----------------------------------------------------------

  bar = createPlayBar(elements.bar, {
    onUndo: () => step(history.undo()),
    onRedo: () => step(history.redo()),
    onCheck: () => void check(),
    // The same box the level list opens, minus the way in: you are already
    // here, so a Play button would offer the page you are standing on.
    onAbout: () =>
      openLevelModal({
        level: record,
        instructions: record.instructions,
        solvedIn: solved
          ? { elapsedMs: elapsed(), checkCount }
          : undefined,
      }),
  });

  /**
   * Undo and redo, on the keys every editor uses.
   *
   * Held here rather than in the editor for the same reason the editor page
   * holds them: both replace the melody outright, which is the one thing the
   * editor cannot do to itself.
   */
  window.addEventListener("keydown", (event) => {
    if (isTypingTarget(event)) return;
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") {
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        step(history.redo());
      }
      return;
    }
    event.preventDefault();
    step(event.shiftKey ? history.redo() : history.undo());
  });

  // Nothing is warned about on the way out: the progress is already written,
  // so leaving loses a few hundred milliseconds of typing at worst. That is a
  // better answer than a dialog.
  window.addEventListener("pagehide", () => {
    clearTimeout(saveTimer);
    clearInterval(ticker);
    document.removeEventListener("visibilitychange", onVisibility);
    save();
  });

  mount();
}
