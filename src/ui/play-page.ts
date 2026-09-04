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
import { ANONYMOUS, type UserSummary } from "../shared/session.js";
import { createEditor, type Editor, type EditorElements } from "./editor.js";
import { keepingScroll } from "./score-overlay.js";
import { createScoreEffects, EFFECT_MS } from "./score-effects.js";
import { arrivedCold } from "./arrival.js";
import { assistPlan, type AssistPlan } from "./assist.js";
import { openAssistModal } from "./assist-modal.js";
import type { BoxOpening } from "./level-box.js";
import { openLevelModal } from "./level-modal.js";
import { createPanelActions, type PanelActions } from "./panel-actions.js";
import { CHECKING_MS, stillToWait } from "./pacing.js";
import { createPlayback, type Playback } from "./playback.js";
import { createSheetHead, type SheetHead } from "./sheet-head.js";
import { createHistoryPair, type HistoryPair } from "./history-pair.js";
import { createSideTools } from "./side-tools.js";
import { isTypingTarget } from "./typing-guard.js";
import { mountVideoPanel } from "./video-panel.js";

export type PlayPageElements = EditorElements & {
  /** The masthead over the score: the title, the subtitle and the byline. */
  sheetHead: HTMLElement;
  /** The note in the side panel's corner about the keyboard shortcuts. */
  sideTools: HTMLElement;
  /** Nothing, here: a puzzle has no Key or Details box to open. */
  panelActions: HTMLElement;
  /** The clock and Check, under the video. */
  panelSubmit: HTMLElement;
  /** Undo and redo, in the keyboard band under Clear pitch. */
  pitchHistory: HTMLElement;
  video: HTMLElement;
  playbackControls: HTMLElement;
  scoreArea: HTMLElement;
};

/** How often the clock redraws. It is read from wall time, so it cannot drift. */
const TICK_MS = 500;

/**
 * How long after the last edit progress is written.
 *
 * Local storage would not mind being written on every keypress. The account
 * store is a request per write, so a run of pitches entered at one a second
 * becomes one save rather than one per note. What a longer wait can lose is
 * bounded by the saves that do not wait: on the tab hiding, after a check,
 * and on the way out.
 */
const SAVE_AFTER_MS = 1000;

export function createPlayPage(
  elements: PlayPageElements,
  level: { id: string; record: TranscriptionRecord },
  store: ProgressStore,
  restored: PlayProgress | undefined,
  viewer: UserSummary | undefined,
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
  /**
   * Whether it was solved in front of us, rather than before the page opened.
   *
   * Only the clock cares, and only for its one pop: arriving at a level you
   * finished last week is a fact about it, not a thing that just happened.
   */
  let justSolved = false;
  let checking = false;
  let report: string | undefined;

  let editor: Editor | undefined;
  let playback: Playback | undefined;
  let actions: PanelActions | undefined;
  let head: SheetHead | undefined;
  let steps: HistoryPair | undefined;
  /**
   * Whether the piano sounds as pitches are set.
   *
   * Off at the start of every puzzle, and not remembered between them: hearing
   * the pitches is a way of solving one, and turning it on for a level says
   * nothing about the next. Held here rather than in the editor, which `mount`
   * rebuilds from nothing on every edit.
   */
  let sound = false;

  /**
   * Whether assist mode has been unlocked on this tune.
   *
   * Kept with the rest of the progress rather than here alone, so it survives
   * a reload and follows the player between machines — and, being progress, it
   * is what the tune's box reads to say a transcription was assisted. It only
   * ever goes one way; nothing below sets it back to false, and the save on
   * the far end could not lower it if it did (`assist.ts`, `progress.md`).
   */
  let assisted = restored?.assisted ?? false;

  /** What assist mode is doing right now: the two tools, and the row. */
  const assist = (): AssistPlan => assistPlan({ activated: assisted, solved });

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

  /**
   * Whether a box that stops the clock is standing over the puzzle.
   *
   * Most boxes stop it, for the reason the tab going away stops it — this is
   * a clock kept by the page for the player's own interest, and it will move
   * behind the check route on the day times are compared between people.
   *
   * The (i) is the exception, and that is a reversal of what this used to do.
   * Re-reading what the author wanted known is part of transcribing rather
   * than a pause from it — it is the same words the sheet would carry if
   * there were room for them — and a clock that stopped for it made
   * consulting the tune's own notes feel like leaving the work. See
   * `openAbout`.
   */
  let reading = false;

  function holdClock(): void {
    if (solved) return;
    reading = true;
    watch = pauseStopwatch(watch, performance.now());
  }

  function releaseClock(): void {
    reading = false;
    // Not while the tab is away: the box may well have been closed by a
    // keystroke in another window, and starting the clock on a page nobody is
    // looking at is exactly what the visibility rule exists to prevent.
    if (solved || document.visibilityState === "hidden") return;
    watch = resumeStopwatch(watch, performance.now());
  }

  const onVisibility = () => {
    // Under a box the clock is already stopped and must stay stopped: coming
    // back to the tab is not coming back to the work.
    if (solved || reading) return;
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
    assisted,
    pitches: [...attemptOf(melody)].map(([index, midi]) => ({ index, midi })),
    judged: judgedOf(verdicts),
  });

  function save(): void {
    // A save that is going now takes the place of one that was waiting: two
    // whole snapshots in flight can land in either order, and the older one
    // landing last would be the one kept.
    clearTimeout(saveTimer);
    // Failure is the store's to swallow: a note being entered is not the
    // moment to interrupt anybody about storage being full or a server being
    // away.
    void store.write(progressNow());
  }

  function saveSoon(): void {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_AFTER_MS);
  }

  // ---- the score ---------------------------------------------------------

  const marks = () => marksOf(melody, verdicts, given);

  /** Draw everything that is not the score: the masthead and the panel. */
  function showBar(): void {
    steps?.update({
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
    });
    head?.update({
      title: record.title,
      subtitle: record.subtitle,
      // The level's author, never the player's: the server has already put
      // this to NULL for an author who asked to be anonymous, which is what
      // ANONYMOUS then stands in for.
      credit: record.author ?? ANONYMOUS,
    });
    const problem = solved ? undefined : checkProblem(melody);
    actions?.update({
      submit: {
        label: checking ? "Checking…" : solved ? "Solved" : "Check",
        disabled: checking || solved || problem !== undefined,
      },
      // What the last check said wins over why the next one cannot be made:
      // "two notes are wrong" is the more useful of the two, and the reason
      // the button is grey is that you are still fixing them.
      message: checking ? "" : (report ?? problem ?? ""),
      clock: { elapsedMs: elapsed(), checkCount, solved, justSolved },
      assist: assist(),
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
      // Read afresh on every rebuild, which is what carries an unlocking
      // through to the switch: activating assist mode mounts the score again.
      assist: { locked: !assist().unlocked },
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

    // Every press is held at "Checking…" for the same moment, whatever the
    // server does with it. The answer often comes back faster than the word
    // can be read, and a score that twitches without having visibly been
    // asked anything reads as a glitch rather than as a verdict.
    //
    // The same moment for a taken-down level and for a solve, so the pace
    // never says which is coming before the words do.
    const pressed = performance.now();
    const settle = (): Promise<void> =>
      new Promise((resume) =>
        setTimeout(
          resume,
          stillToWait(CHECKING_MS, performance.now() - pressed),
        ),
      );

    const attempt = attemptOf(melody);
    try {
      const response = await fetch(`/api/tunes/${level.id}/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pitches: [...attempt].map(([index, midi]) => ({ index, midi })),
        }),
      });
      if (response.status === 404) {
        // The level was here when the page opened and is not now: deleted, or
        // unpublished and given a new address. A fact about the level rather
        // than about the attempt, so it is said plainly, without "could not
        // be checked" in front of it.
        await settle();
        checking = false;
        report = "This tune has been taken down.";
        showBar();
        return;
      }
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

      // Held here, before anything the answer says is acted on, so the whole
      // verdict — the marks, the shake, the burst, the words under the button
      // — arrives at once when the moment is up.
      await settle();

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
        justSolved = true;
        // Nothing is left to find, so nothing is left to give away: the tools
        // open on the solve without anybody having to ask. `mount()` below
        // hands the same fact to the piano's switch.
        unlockAssist();
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

      if (answered.solved) {
        // The solved box, once the burst has had its moment. Only on the
        // check that solved it: reopening an already-solved level restores
        // `solved` quietly, and this branch is never reached again.
        setTimeout(() => openAbout("solving"), EFFECT_MS + 500);
      }

      save();
    } catch (error) {
      await settle();
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

  // No control bar, ever: the player is driven from the panel on this page,
  // and its own chrome flashing at every loop was only distraction.
  const iframe = mountVideoPanel(elements.video, record.videoId, {
    controls: false,
  });
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
    //
    // Hearing the transcription against the video is the other half of assist
    // mode, so the toggle that does it arrives locked unless this tune has
    // already opened it.
    { canRetime: false, assist: { locked: !assist().unlocked } },
  );

  // ---- the bar -----------------------------------------------------------

  /**
   * How far this puzzle has got, as the box reads it.
   *
   * `progressNow` counts the note the puzzle gave away, because the check
   * route is sent every pitch on the stave; the box must not, or a tune opened
   * a moment ago would offer to be *continued*. Nobody wrote that note.
   */
  const boxProgress = (): PlayProgress => ({
    ...progressNow(),
    pitches: [...attemptOf(melody)]
      .filter(([index]) => !given.has(index))
      .map(([index, midi]) => ({ index, midi })),
  });

  /**
   * The same box the lists open, opened three ways from here: by arriving at a
   * puzzle without having come through a list, by the (i) beside the title,
   * and by the check that solved it. `levelBoxPlan` knows what each offers;
   * what this page adds is what the clock does under each.
   *
   * It stops under two of the three. Arriving cold, the box is the room in
   * which somebody decides whether to play at all, and the work has not begun;
   * the solve has already frozen the clock, so nothing there is held either
   * way.
   *
   * It keeps running under the (i) — the one a player opens *while* working,
   * on purpose, to re-read the instructions. That is not a break from
   * transcribing, it is the part of transcribing where you check the notes,
   * and stopping the clock for it made the honest thing the thing that paused
   * your own timer.
   */
  function openAbout(opening: BoxOpening): void {
    const stopsClock = opening !== "info";
    if (stopsClock) holdClock();
    openLevelModal({
      level: record,
      instructions: record.instructions,
      page: "play",
      opening,
      viewer,
      progress: boxProgress(),
      // Nothing to release where nothing was held: `releaseClock` would resume
      // a clock the visibility rule had paused for its own reasons.
      onClose: stopsClock ? releaseClock : undefined,
    });
  }

  /**
   * Open the two tools, once the box that explains them has been read.
   *
   * The clock stops while the box is up, as it does under every other box:
   * reading what a tool does is not transcribing. Saved at once rather than on
   * the debounce, because this is the one piece of progress the player cannot
   * make again — it is the answer to a question that will not be asked twice.
   */
  async function offerAssist(): Promise<void> {
    if (assisted) return;
    holdClock();
    const yes = await openAssistModal();
    releaseClock();
    if (!yes) return;

    assisted = true;
    unlockAssist();
    // The switch beside the piano is built by the editor, which reads the lock
    // as it draws: the score is mounted again so that it does.
    mount();
    save();
  }

  /** Let the playback panel's half of assist mode through, if it may. */
  function unlockAssist(): void {
    if (assist().unlocked) playback?.unlockAssist();
  }

  // No rhythm switch and no Key or Details: the rhythm and the key are the
  // level's, and the words are its author's. What is left in the panel is the
  // clock, the one button that asks whether you are right, and assist mode's
  // own row under them.
  actions = createPanelActions(
    { boxes: elements.panelActions, submit: elements.panelSubmit },
    { onSubmit: () => void check(), onAssist: () => void offerAssist() },
  );
  // The (i) rides the title on the sheet, as a footnote mark does: the box it
  // opens is about the piece, so it belongs with the piece's name.
  head = createSheetHead(elements.sheetHead, { onAbout: () => openAbout("info") });
  createSideTools(elements.sideTools);
  steps = createHistoryPair(elements.pitchHistory, {
    onUndo: () => step(history.undo()),
    onRedo: () => step(history.redo()),
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

  // A tune that opens solved, or one whose tools were opened on a previous
  // visit, finds them open: `mount()` below tells the piano's switch, and this
  // tells the panel beside the video.
  unlockAssist();

  mount();

  // Somebody who reached this page without going through a list has not seen
  // what they are about to play. The box says it, and the clock waits.
  if (arrivedCold(window.sessionStorage, level.id)) {
    openAbout("arrival");
  }
}
