/**
 * Whether the name being typed could be yours, said as it is typed.
 *
 * The rules are answered at once, from `usernameProblem`, before anything is
 * asked of the server; a name that passes them is asked about after a short
 * quiet, and every keystroke restarts the quiet, so a server is not asked
 * about "j", "ja", "jas". One indexed lookup per pause is nothing, and the
 * answer reserves nothing: the save that follows still meets the unique
 * index, and a 409 there is the race.
 *
 * Only the answer to the latest question is believed. The first answer can
 * arrive after the second question was asked — a slow network, a fast
 * typist — and it is about a name nobody is looking at any more.
 *
 * The timer and the fetch are handed in, so a test can turn the clock by
 * hand and answer the server as it likes.
 */

import type { Fetch } from "../puzzle/progress.js";
import { cleanUsername, usernameProblem } from "../shared/session.js";

export type NameVerdict =
  | { kind: "unchanged" }
  | { kind: "problem"; sentence: string }
  | { kind: "checking" }
  | { kind: "available"; name: string }
  | { kind: "taken" }
  | { kind: "unknown" };

/** How long the typing has to stop before the server is asked. */
export const ASK_AFTER_MS = 300;

export type NameCheck = {
  /** What the field holds now. */
  typed(name: string): void;
  /** The account's name changed, so "unchanged" means something else now. */
  renamed(name: string): void;
  /** Forget any question pending. */
  stop(): void;
};

/** `setTimeout`'s shape, returning a way to cancel. */
export type Schedule = (run: () => void, afterMs: number) => () => void;

export function createNameCheck(options: {
  fetch: Fetch;
  /** The account's name as it stands, which is never "taken". */
  current: string;
  schedule: Schedule;
  onVerdict: (verdict: NameVerdict) => void;
}): NameCheck {
  const { fetch, schedule, onVerdict } = options;
  let current = cleanUsername(options.current);
  let cancel: (() => void) | undefined;
  let question = 0;

  async function ask(name: string): Promise<void> {
    const asked = ++question;
    let verdict: NameVerdict;
    try {
      const response = await fetch(`/api/username?name=${encodeURIComponent(name)}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const said = (await response.json()) as { available?: unknown; problem?: unknown };
      if (!response.ok || typeof said.available !== "boolean") {
        verdict = { kind: "unknown" };
      } else if (said.available) {
        verdict = { kind: "available", name };
      } else if (typeof said.problem === "string") {
        verdict = { kind: "problem", sentence: said.problem };
      } else {
        verdict = { kind: "taken" };
      }
    } catch {
      verdict = { kind: "unknown" };
    }
    if (asked === question) onVerdict(verdict);
  }

  return {
    typed(raw) {
      cancel?.();
      cancel = undefined;
      // A new question makes any answer still on its way about an old one.
      question++;

      const name = cleanUsername(raw);
      if (name === current) {
        onVerdict({ kind: "unchanged" });
        return;
      }
      const problem = usernameProblem(name);
      if (problem !== undefined) {
        onVerdict({ kind: "problem", sentence: problem });
        return;
      }
      onVerdict({ kind: "checking" });
      cancel = schedule(() => void ask(name), ASK_AFTER_MS);
    },
    renamed(name) {
      current = cleanUsername(name);
    },
    stop() {
      cancel?.();
      cancel = undefined;
      question++;
    },
  };
}
