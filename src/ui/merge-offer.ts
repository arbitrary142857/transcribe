/**
 * The hand-off, drawn: the question asked before this browser's records are
 * dropped. Every decision is `handoff.ts`'s; this only puts it on the page.
 *
 * It used to hold two more things — a question that opened on arrival at the
 * catalog and at a puzzle, and the standing line under the catalog offering
 * the records. Both are gone, and `handoff.ts` says why. What is left is the
 * profile page's, which is the one place the offer now lives.
 */

import { forgetLocalProgress, forgetQuestion } from "../puzzle/handoff.js";
import type { LocalProgressStore, PlayProgress } from "../puzzle/progress.js";
import { openModal } from "./modal.js";

/** Forget, behind the question. Answers whether anything was forgotten. */
export async function offerToForget(
  local: LocalProgressStore,
  records: readonly PlayProgress[],
): Promise<boolean> {
  const agreed = await openModal(forgetQuestion(records.length));
  if (!agreed) return false;
  await forgetLocalProgress(local, records);
  return true;
}
