import { toMilliseconds } from "./timecode.js";

/**
 * The setup page's timing box, as arithmetic.
 *
 * Four numbers appear on screen — start, end, bar count, BPM — but only three
 * are state. The BPM is always derived from the other three, never stored:
 * storing it would create a fourth value to keep consistent, and every rule
 * the lock imposes turns out to preserve the one thing a derived BPM needs,
 * the seconds each bar takes. That is why there is no rounding question
 * anywhere in here — there is no second copy to drift.
 *
 * The lock, concretely: while locked, an edit to any one field moves exactly
 * one other so that `(end − start) / measures` never changes. Which partner
 * moves is the user's spec — start pushes end, end pulls start, measures
 * pushes end — and every such automatic move is reported in `autoEdited` so
 * the page can flash the field that changed under its own power.
 */
export type TimingField = "start" | "end" | "measures" | "bpm";

export type TimingState = {
  /** Video seconds, quantized to the millisecond. */
  readonly start?: number;
  readonly end?: number;
  /** Whole bars between the marks. */
  readonly measures?: number;
  readonly locked: boolean;
};

export type TimingAction =
  | { kind: "type-start"; seconds: number | undefined }
  | { kind: "type-end"; seconds: number | undefined }
  | { kind: "type-measures"; count: number | undefined }
  | { kind: "type-bpm"; bpm: number }
  | { kind: "mark-start"; seconds: number }
  | { kind: "mark-end"; seconds: number }
  | { kind: "nudge"; field: "start" | "end"; seconds: number }
  | { kind: "toggle-lock" };

/**
 * The box an action wrote into directly, when it was not typed into.
 *
 * `autoEdited` names what moved as a *consequence* — the tempo, or the partner
 * mark under a lock — and deliberately leaves out the field being acted on,
 * since somebody typing into a box can see what they typed. Marking is the
 * exception: the value lands from a button or a shortcut, and the box it lands
 * in is often not the thing being looked at.
 */
export function markedField(action: TimingAction): readonly TimingField[] {
  if (action.kind === "mark-start") return ["start"];
  if (action.kind === "mark-end") return ["end"];
  return [];
}

export type TimingStep = {
  readonly state: TimingState;
  /** Fields rewritten beyond the one acted on — the page flashes these. */
  readonly autoEdited: readonly TimingField[];
  /** Why the action could not be taken; the state is unchanged. */
  readonly rejected?: string;
};

/**
 * The tempos worth believing. Real music sits in roughly 30–300; the margins
 * are generous. The bound is not taste — below it a mistake reads as a tempo,
 * and above it the metronome would be asked for thousands of clicks a second.
 */
export const BPM_MIN = 10;
export const BPM_MAX = 600;

/** A typo guard, not a design limit. */
export const MEASURES_MAX = 999;

/** The tempo the three fields imply, if they imply one. */
export function bpmOf(
  state: TimingState,
  beatsPerBar: number,
): number | undefined {
  const { start, end, measures } = state;
  if (start === undefined || end === undefined || measures === undefined) {
    return undefined;
  }
  if (end <= start) {
    return undefined;
  }
  return (measures * beatsPerBar * 60) / (end - start);
}

/**
 * What still stands between here and a usable tempo, or nothing.
 *
 * This is the gate: the page may not be left, the metronome may not run and
 * the lock may not close while this has something to say.
 */
export function timingProblem(
  state: TimingState,
  beatsPerBar: number,
): string | undefined {
  const { start, end, measures } = state;
  if (start === undefined || end === undefined) {
    return "Mark where the first bar starts and the last bar ends.";
  }
  if (end <= start) {
    return "The end mark has to come after the start mark.";
  }
  if (measures === undefined) {
    return "How many bars is the marked section?";
  }
  const bpm = bpmOf(state, beatsPerBar)!;
  if (bpm < BPM_MIN || bpm > BPM_MAX) {
    return `That would be ${Math.round(bpm)} BPM — check the marks.`;
  }
  return undefined;
}

const reject = (state: TimingState, rejected: string): TimingStep => ({
  state,
  autoEdited: [],
  rejected,
});

const clamp = (seconds: number, duration: number | undefined): number =>
  Math.min(duration ?? Infinity, Math.max(0, seconds));

const isCount = (count: number): boolean =>
  Number.isInteger(count) && count >= 1 && count <= MEASURES_MAX;

/** Whether the derived BPM changes between two states, seen at display size. */
function bpmMoved(
  before: TimingState,
  after: TimingState,
  beatsPerBar: number,
): boolean {
  const a = bpmOf(before, beatsPerBar);
  const b = bpmOf(after, beatsPerBar);
  if (a === undefined || b === undefined) {
    return a !== b;
  }
  return Math.abs(a - b) > 1e-9;
}

/**
 * Set one of the two marks, moving its partner if the lock demands it.
 *
 * The edited value is clamped into the video first; a partner that would land
 * outside the video rejects the whole edit instead, because clamping just one
 * end of a locked pair would change the tempo the lock exists to keep.
 */
function placeMark(
  state: TimingState,
  field: "start" | "end",
  seconds: number,
  beatsPerBar: number,
  duration: number | undefined,
): TimingStep {
  const asked = toMilliseconds(seconds);
  const value = toMilliseconds(clamp(asked, duration));
  const clamped = value !== asked;

  if (!state.locked) {
    const next = { ...state, [field]: value };
    const autoEdited: TimingField[] = clamped ? [field] : [];
    if (bpmMoved(state, next, beatsPerBar)) autoEdited.push("bpm");
    return { state: next, autoEdited };
  }

  // Locked: the span survives, so the partner moves by exactly as much.
  const span = toMilliseconds(state.end! - state.start!);
  const partner: "start" | "end" = field === "start" ? "end" : "start";
  const partnerValue = toMilliseconds(
    field === "start" ? value + span : value - span,
  );
  if (partnerValue < 0) {
    return reject(
      state,
      "That would push the start mark before the video begins.",
    );
  }
  if (duration !== undefined && partnerValue > duration) {
    return reject(state, "That would push the end mark past the video.");
  }
  return {
    state: { ...state, [field]: value, [partner]: partnerValue },
    autoEdited: clamped ? [field, partner] : [partner],
  };
}

export function stepTiming(
  state: TimingState,
  action: TimingAction,
  beatsPerBar: number,
  duration?: number,
): TimingStep {
  switch (action.kind) {
    case "mark-start":
      return placeMark(state, "start", action.seconds, beatsPerBar, duration);
    case "mark-end":
      return placeMark(state, "end", action.seconds, beatsPerBar, duration);

    case "type-start":
    case "type-end": {
      const field = action.kind === "type-start" ? "start" : "end";
      if (action.seconds === undefined) {
        if (state.locked) {
          return reject(state, "Unlock the tempo to clear a mark.");
        }
        const next = { ...state, [field]: undefined };
        return {
          state: next,
          autoEdited: bpmMoved(state, next, beatsPerBar) ? ["bpm"] : [],
        };
      }
      return placeMark(state, field, action.seconds, beatsPerBar, duration);
    }

    case "nudge": {
      const current = state[action.field];
      if (current === undefined) {
        return { state, autoEdited: [] };
      }
      return placeMark(
        state,
        action.field,
        current + action.seconds,
        beatsPerBar,
        duration,
      );
    }

    case "type-measures": {
      if (action.count === undefined) {
        if (state.locked) {
          return reject(state, "Unlock the tempo to clear the bar count.");
        }
        const next = { ...state, measures: undefined };
        return {
          state: next,
          autoEdited: bpmMoved(state, next, beatsPerBar) ? ["bpm"] : [],
        };
      }
      if (!isCount(action.count)) {
        return reject(
          state,
          `The bar count is a whole number from 1 to ${MEASURES_MAX}.`,
        );
      }
      if (!state.locked) {
        const next = { ...state, measures: action.count };
        return {
          state: next,
          autoEdited: bpmMoved(state, next, beatsPerBar) ? ["bpm"] : [],
        };
      }
      // Locked: each bar keeps the seconds it had, so the end moves.
      const barSeconds = (state.end! - state.start!) / state.measures!;
      const end = toMilliseconds(state.start! + action.count * barSeconds);
      if (duration !== undefined && end > duration) {
        return reject(state, "That many bars would run past the video.");
      }
      return {
        state: { ...state, measures: action.count, end },
        autoEdited: ["end"],
      };
    }

    case "type-bpm": {
      if (state.locked) {
        return reject(state, "The tempo is locked.");
      }
      if (state.start === undefined || state.measures === undefined) {
        return reject(
          state,
          "A tempo needs a start mark and a bar count to act on.",
        );
      }
      if (action.bpm < BPM_MIN || action.bpm > BPM_MAX) {
        return reject(
          state,
          `Tempos run from ${BPM_MIN} to ${BPM_MAX} BPM.`,
        );
      }
      const end = toMilliseconds(
        state.start + (state.measures * beatsPerBar * 60) / action.bpm,
      );
      if (duration !== undefined && end > duration) {
        return reject(state, "That tempo would run the end past the video.");
      }
      return { state: { ...state, end }, autoEdited: ["end"] };
    }

    case "toggle-lock": {
      if (state.locked) {
        return { state: { ...state, locked: false }, autoEdited: [] };
      }
      const problem = timingProblem(state, beatsPerBar);
      if (problem) {
        return reject(state, problem);
      }
      return { state: { ...state, locked: true }, autoEdited: [] };
    }
  }
}
