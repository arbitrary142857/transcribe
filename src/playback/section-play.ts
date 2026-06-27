import { JUMP_SECONDS } from "./clock.js";

/**
 * Playing just a marked stretch of the video, beside controls we do not own.
 *
 * There is no mode here and nothing to take control of. The player belongs to
 * YouTube, and the only things its controls can ever do are the things ours
 * do: teleport the timestamp, start it, stop it. So the section's boundary is
 * simply always alive, and it is *edge-triggered*: it acts when playback
 * flows over the end mark — was before it at one look, at-or-past it the next
 * — and never merely because the video finds itself beyond it. A scrub past
 * the end is a teleport, which re-bases the detector and crosses nothing, so
 * exploring the video is always free, and a wrap's own landing can never
 * re-trigger the boundary that caused it.
 *
 * An end mark at-or-before the start mark is no end at all: nothing fires on
 * it, and the section runs open-ended from the start — which keeps its full
 * meaning, as the place play restarts from and jump-back returns to.
 *
 * Everything here is arithmetic on facts handed in; the driver owns the
 * timers and the player, and executes whatever commands come back.
 */
export type SectionRange = { readonly start: number; readonly end: number };

/** The player's life as its events tell it. */
export type PlayerLife = "playing" | "paused" | "buffering" | "ended";

export type SectionFact =
  | { kind: "tick"; now: number; wall: number }
  /** The reading is somewhere it could not have got to by playing. */
  | { kind: "jump"; to: number; wall: number }
  | { kind: "state"; state: PlayerLife; now: number; wall: number };

export type SectionCommand =
  | { kind: "seek"; to: number }
  | { kind: "play" }
  | { kind: "pause" };

export type SectionState = {
  readonly range: SectionRange;
  readonly looping: boolean;
  /** Whether the transport means to be playing — the play button mirrors this. */
  readonly playing: boolean;
  /** Where the video was at the last look: the edge detector's memory. */
  readonly prev?: number;
  /**
   * Where a crossing asked for a stop, until the pause lands. A pause landing
   * far past it — a throttled background tab noticing late — is clamped back,
   * so the frame is not left standing outside the section.
   */
  readonly stopAt?: number;
};

export type SectionStep = {
  readonly state: SectionState;
  readonly commands: readonly SectionCommand[];
};

export function createSection(range: SectionRange): SectionState {
  return { range, looping: false, playing: false };
}

export const setRange = (
  state: SectionState,
  range: SectionRange,
): SectionState => ({ ...state, range });

export const setLooping = (
  state: SectionState,
  looping: boolean,
): SectionState => ({ ...state, looping });

/** Whether the end mark means anything at all. */
const hasEnd = (range: SectionRange): boolean => range.end > range.start;

const inside = (range: SectionRange, now: number): boolean =>
  now >= range.start && (!hasEnd(range) || now < range.end);

const still = (state: SectionState): SectionStep => ({ state, commands: [] });

export function stepSection(
  state: SectionState,
  fact: SectionFact,
): SectionStep {
  switch (fact.kind) {
    case "tick": {
      const crossed =
        hasEnd(state.range) &&
        state.playing &&
        state.prev !== undefined &&
        state.prev < state.range.end &&
        fact.now >= state.range.end;
      const moved = { ...state, prev: fact.now };

      if (!crossed) {
        return still(moved);
      }
      if (state.looping) {
        return {
          state: moved,
          commands: [{ kind: "seek", to: state.range.start }],
        };
      }
      return {
        state: { ...moved, stopAt: state.range.end },
        commands: [{ kind: "pause" }],
      };
    }

    case "jump":
      // A teleport is not a crossing, whoever made it; the detector starts
      // over from where the video landed.
      return still({ ...state, prev: fact.to, stopAt: undefined });

    case "state": {
      switch (fact.state) {
        case "buffering":
          // A stall says nothing about anyone's intent.
          return still(state);

        case "playing":
          return still({ ...state, playing: true, stopAt: undefined });

        case "paused": {
          const stopped = { ...state, playing: false, stopAt: undefined };
          if (
            state.stopAt !== undefined &&
            fact.now - state.stopAt > JUMP_SECONDS
          ) {
            return {
              state: stopped,
              commands: [{ kind: "seek", to: state.stopAt }],
            };
          }
          return still(stopped);
        }

        case "ended": {
          // The video ran out. Restarting is the start mark's business, so it
          // works whether or not the end mark means anything.
          const done = { ...state, playing: false, prev: undefined };
          if (state.looping) {
            return {
              state: done,
              commands: [{ kind: "seek", to: state.range.start }, { kind: "play" }],
            };
          }
          return still(done);
        }
      }
    }
  }
}

/**
 * Start the section, or resume it.
 *
 * From inside the section, play means carry on from here — which is what
 * keeps pausing mid-phrase and pressing play again from losing the place.
 * From anywhere else it means the section from its top.
 */
export function pressPlay(state: SectionState, now: number): SectionStep {
  if (inside(state.range, now)) {
    return { state, commands: [{ kind: "play" }] };
  }
  return {
    state,
    commands: [{ kind: "seek", to: state.range.start }, { kind: "play" }],
  };
}

export function pressPause(state: SectionState): SectionStep {
  return { state, commands: [{ kind: "pause" }] };
}

/** Back to the top of the section, playing or paused as the video already is. */
export function pressJumpBack(state: SectionState): SectionStep {
  return { state, commands: [{ kind: "seek", to: state.range.start }] };
}
