/**
 * Offering a browser's progress to an account.
 *
 * A browser holds progress for whoever used it, and an account holds progress
 * for whoever signed in. When those are the same person, the browser's
 * records should become the account's — but nothing here decides that they
 * are. Two people may share a browser: A plays signed in, signs out, B plays
 * signed out, A signs in again, and a merge that simply happened would hand
 * B's records to A. So the records are *offered*, and move only on a yes.
 *
 * Nothing here offers unprompted any more. There used to be a question on
 * arrival — asked once per account per machine, off a `transcribe:viewer`
 * marker — and a standing line under the catalog for everything after. Both
 * are gone: being told about your own stored progress in the first seconds
 * after signing in is being told at the one moment you came for something
 * else. The offer lives on the profile page instead, as a row somebody meets
 * when they have gone there to settle their account. Nothing is lost while
 * they have not: the records stay in the browser, and the row appears
 * whenever there are any.
 *
 * So what is left is the two acts themselves — take them into the account, or
 * drop them — and the words for asking about each.
 *
 * Pure but for the ports handed in — storage, the local store, fetch — so the
 * decisions are tested in plain Node, and `ui/merge-offer.ts` does only the
 * drawing. The wording lives here for the same reason.
 */

import type { Fetch, LocalProgressStore, PlayProgress } from "./progress.js";

export type MergeOutcome = { taken: string[] } | { trouble: string };

/**
 * Send every record to the account, and let go of them once it has answered.
 *
 * Every record sent is removed on a 2xx, not only the ones the server says it
 * took: the server has answered for the batch, and a record it passed over
 * names a level it no longer has, which no later merge could take either —
 * left behind, it would keep the offer alive for ever. On any other answer
 * nothing is removed, and the reason comes back as a sentence.
 */
export async function mergeIntoAccount(options: {
  fetch: Fetch;
  local: LocalProgressStore;
  records: readonly PlayProgress[];
}): Promise<MergeOutcome> {
  const { fetch, local, records } = options;

  let response;
  try {
    response = await fetch("/api/progress/merge", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ records }),
    });
  } catch {
    return { trouble: "The server could not be reached. Try again in a moment." };
  }

  if (!response.ok) {
    const said = (await response.json().catch(() => ({}))) as { error?: string };
    return { trouble: said.error ?? `The server answered ${response.status}.` };
  }

  let taken: unknown;
  try {
    taken = ((await response.json()) as { taken?: unknown }).taken;
  } catch {
    taken = undefined;
  }
  if (!Array.isArray(taken) || !taken.every((id) => typeof id === "string")) {
    return { trouble: "The server's answer could not be read." };
  }

  for (const record of records) {
    await local.remove(record.levelId);
  }
  return { taken: taken as string[] };
}

/** Drop every record given from this browser. The question is asked before this is called. */
export async function forgetLocalProgress(
  local: LocalProgressStore,
  records: readonly PlayProgress[],
): Promise<void> {
  for (const record of records) {
    await local.remove(record.levelId);
  }
}

// ---- the wording ----------------------------------------------------------

const tunes = (count: number) => (count === 1 ? "1 tune" : `${count} tunes`);

export type Question = {
  title: string;
  body: string[];
  confirm: string;
  cancel: string;
};

export function forgetQuestion(count: number): Question {
  return {
    title: "Forget this browser's progress?",
    body: [
      `Progress on ${tunes(count)} played without signing in will be removed from this browser.`,
      "This cannot be undone.",
    ],
    confirm: "Forget it",
    cancel: "Keep it",
  };
}
