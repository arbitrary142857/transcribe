/**
 * The hand-off, drawn: the question on arrival, and the line that stands
 * under the catalog afterwards. Every decision is `handoff.ts`'s; this only
 * puts it on the page.
 */

import {
  forgetLocalProgress,
  forgetQuestion,
  handoffFor,
  handoffSentence,
  markSeenHere,
  mergeIntoAccount,
  mergeQuestion,
} from "../puzzle/handoff.js";
import type {
  Fetch,
  LocalProgressStore,
  PlayProgress,
  Storage,
} from "../puzzle/progress.js";
import type { UserSummary } from "../shared/session.js";
import { openModal } from "./modal.js";

/**
 * Ask once, on arrival, when this account is new to this machine and there
 * is something to bring.
 *
 * Resolves once the question is settled and any merge has finished, which is
 * what a page waits on before it reads its own record — the catalog should
 * open showing what was just brought in. Answers the trouble sentence if a
 * merge was agreed to and failed, for a page with somewhere to put it; the
 * records are still in the browser then, and the standing line offers them
 * again.
 */
export async function offerMergeOnArrival(options: {
  user: UserSummary | undefined;
  storage: Storage;
  local: LocalProgressStore;
  fetch: Fetch;
}): Promise<string | undefined> {
  const { user, storage, local, fetch } = options;
  if (user === undefined) return undefined;

  const { records, ask } = await handoffFor(storage, local, user.id);
  if (!ask) {
    markSeenHere(storage, user.id);
    return undefined;
  }

  const agreed = await openModal(mergeQuestion(records.length));
  // Either answer settles the question for this account on this machine.
  markSeenHere(storage, user.id);
  if (!agreed) return undefined;

  const outcome = await mergeIntoAccount({ fetch, local, records });
  return "trouble" in outcome ? outcome.trouble : undefined;
}

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

/**
 * The standing line under the catalog: the sentence and its two ways out.
 *
 * No "leave it here" on the line — leaving it is what doing nothing does, and
 * a line that hid for one page view would only be back on the next, which is
 * nagging with extra steps. Forgetting asks first.
 */
export function createHandoffLine(options: {
  count: number;
  onBringIn: () => void;
  onForget: () => void;
}): HTMLElement {
  const line = document.createElement("span");
  line.className = "note-handoff";

  const action = (label: string, run: () => void): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-action";
    button.textContent = label;
    button.addEventListener("click", run);
    return button;
  };

  line.append(
    `${handoffSentence(options.count)} `,
    action("Bring it into your account", options.onBringIn),
    " · ",
    action("Forget it", options.onForget),
  );
  return line;
}
