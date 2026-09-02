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
 * When to offer, unprompted: when this account is new to this machine.
 * `transcribe:viewer` holds the id of the last account this browser was asked
 * about. A different answer from /api/me, with at least one readable record
 * held, is the moment — the levels that said "Transcribed" a minute ago have
 * just gone back to "Not Started", and a question explains why. Either answer
 * writes the marker, so the question comes once per account per machine. It
 * is not cleared on sign-out, so records made signed-out afterwards by the
 * same person never raise the question again; the catalog's standing line is
 * what catches those. The modal is for arrival; the line is for everything
 * after.
 *
 * Pure but for the ports handed in — storage, the local store, fetch — so the
 * decisions are tested in plain Node, and `ui/merge-offer.ts` does only the
 * drawing. The wording lives here for the same reason.
 */

import type { Fetch, LocalProgressStore, PlayProgress, Storage } from "./progress.js";

export const VIEWER_KEY = "transcribe:viewer";

/**
 * Whether this account has yet to be seen on this machine: the marker is
 * absent, or names somebody else. A storage that refuses reads as nobody
 * having been seen, which errs towards asking.
 */
export function isNewHere(storage: Storage, userId: string): boolean {
  try {
    return storage.getItem(VIEWER_KEY) !== userId;
  } catch {
    return true;
  }
}

export function markSeenHere(storage: Storage, userId: string): void {
  try {
    storage.setItem(VIEWER_KEY, userId);
  } catch {
    // A storage that will not keep the marker asks again next time, which is
    // the lesser wrong.
  }
}

/** What this browser holds that an account could take, and whether to ask about it unprompted. */
export async function handoffFor(
  storage: Storage,
  local: LocalProgressStore,
  userId: string,
): Promise<{ records: PlayProgress[]; ask: boolean }> {
  const records = await local.readAll();
  return { records, ask: records.length > 0 && isNewHere(storage, userId) };
}

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

export function mergeQuestion(count: number): Question {
  return {
    title: "Bring this browser's progress into your account?",
    body: [
      `This browser holds progress on ${tunes(count)} played without signing in.`,
      "Your account keeps whichever side is further along on each tune — a solve over an attempt, the better solve over the other, more found notes over fewer — and the verdicts from both.",
      "Afterwards the records leave this browser. This cannot be undone.",
    ],
    confirm: "Bring it in",
    cancel: "Leave it here",
  };
}

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

/** The standing line under the catalog, while records remain. */
export function handoffSentence(count: number): string {
  return `This browser also holds progress on ${tunes(count)} played without signing in.`;
}
