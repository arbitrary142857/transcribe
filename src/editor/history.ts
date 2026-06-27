import { decode, encode, type MelodyJson } from "./codec.js";
import type { Melody } from "../music/melody.js";

/** How many steps back the stack keeps. */
const DEPTH = 100;

export type History = {
  /** Record the melody as it now stands, if it has changed. */
  record(melody: Melody): void;
  /** The melody one step back, or `undefined` at the beginning. */
  undo(): Melody | undefined;
  /** The melody one step forward, or `undefined` at the end. */
  redo(): Melody | undefined;
  canUndo(): boolean;
  canRedo(): boolean;
};

/**
 * Undo over encoded snapshots.
 *
 * A safety net rather than the way things are meant to be taken back: writing a
 * duration back over a rest already restores what was there, and no edit ever
 * moves a barline, so most mistakes undo themselves by being written over.
 * Snapshots are cheap at these sizes, and reusing the save format means undo
 * and storage cannot drift apart.
 */
export function createHistory(initial: Melody): History {
  const steps: string[] = [JSON.stringify(encode(initial))];
  let at = 0;

  const melodyAt = (index: number): Melody =>
    decode(JSON.parse(steps[index]!) as MelodyJson);

  return {
    record(melody) {
      const snapshot = JSON.stringify(encode(melody));
      if (snapshot === steps[at]) {
        return;
      }
      // Anything undone past is abandoned once a new edit is made, which is
      // what keeps the stack a history rather than a tree.
      steps.length = at + 1;
      steps.push(snapshot);
      if (steps.length > DEPTH) {
        steps.shift();
      }
      at = steps.length - 1;
    },

    undo() {
      if (at === 0) return undefined;
      at -= 1;
      return melodyAt(at);
    },

    redo() {
      if (at >= steps.length - 1) return undefined;
      at += 1;
      return melodyAt(at);
    },

    canUndo: () => at > 0,
    canRedo: () => at < steps.length - 1,
  };
}
