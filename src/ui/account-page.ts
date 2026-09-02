/**
 * The account's own page: the name, the two settings, what this browser
 * still holds, and the way out.
 *
 * Everything here is the signed-in person's to change about themselves and
 * nothing else, so it is one column of plain panels rather than an
 * application. The name is the part with a conversation in it: as it is
 * typed, `name-check.ts` says whether it could be yours, and Save waits on
 * that. The two settings are switches that save as they flip. The browser's
 * progress is the same hand-off the catalog offers, in the one place somebody
 * would look for it on purpose. Deleting is behind a question that says
 * exactly what goes.
 *
 * Built from elements with their text set, never from markup; the sentences
 * are pure functions, tested on their own.
 */

import { mergeIntoAccount } from "../puzzle/handoff.js";
import type { Fetch, LocalProgressStore, PlayProgress } from "../puzzle/progress.js";
import {
  ANONYMOUS,
  USERNAME,
  readMe,
  type UserSummary,
} from "../shared/session.js";
import { createField } from "./details-panel.js";
import { createHandoffLine, offerToForget } from "./merge-offer.js";
import { openModal } from "./modal.js";
import { createNameCheck, type NameVerdict } from "./name-check.js";
import { createSwitch } from "./switch.js";

// ---- the sentences --------------------------------------------------------

/** What the name does, and whether it was the person's own idea. */
export function nameSentence(user: UserSummary): string {
  const name = user.username ?? ANONYMOUS;
  if (!user.choseUsername) {
    return `${name} was picked for you. Choose your own, or keep it.`;
  }
  return user.anonymousAuthor
    ? `Your tunes say by ${ANONYMOUS} while you are shown as Anonymous; ${name} is kept for when you are not.`
    : `Your tunes say by ${name}.`;
}

/** The word under the name field for each verdict. */
export function verdictSentence(verdict: NameVerdict): string {
  switch (verdict.kind) {
    case "available":
      return "Available.";
    case "taken":
      return "Taken.";
    case "problem":
      return verdict.sentence;
    case "unknown":
      return "That could not be checked just now.";
    case "unchanged":
    case "checking":
      return "";
  }
}

// ---- the page -------------------------------------------------------------

export type AccountPageOptions = {
  host: HTMLElement;
  user: UserSummary;
  fetch: Fetch;
  local: LocalProgressStore;
  /** Tell the nav's corner the name changed, since its answer is stale. */
  onRenamed: (user: UserSummary) => void;
};

/** The sentence on a refused answer, or one about the status if it sent none. */
async function refusal(response: { status: number; json(): Promise<unknown> }): Promise<string> {
  const said = (await response.json().catch(() => ({}))) as { error?: string };
  return said.error ?? `The server answered ${response.status}.`;
}

export function createAccountPage(options: AccountPageOptions): void {
  const { host, fetch, local } = options;
  let user = options.user;

  const panel = (heading: string): HTMLElement => {
    const section = document.createElement("section");
    section.className = "panel account-panel";
    const title = document.createElement("h2");
    title.className = "account-heading";
    title.textContent = heading;
    section.append(title);
    host.append(section);
    return section;
  };

  const line = (text = "", className = "account-note"): HTMLParagraphElement => {
    const p = document.createElement("p");
    p.className = className;
    p.setAttribute("role", "status");
    p.textContent = text;
    return p;
  };

  /** One change, sent; the user as the server now has them, or a sentence. */
  async function change(body: Record<string, unknown>): Promise<string | undefined> {
    let response;
    try {
      response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return "The server could not be reached. Try again in a moment.";
    }
    if (!response.ok) return refusal(response);
    const said = readMe(await response.json().catch(() => undefined));
    if (said === undefined) return "The server's answer could not be read.";
    user = said;
    return undefined;
  }

  // ---- the name ----------------------------------------------------------

  const naming = panel("Your name");
  const about = line(nameSentence(user));
  const verdict = line("", "account-verdict");

  const field = createField(
    { label: "Username", hint: user.username ?? "", max: USERNAME.max },
    () => check.typed(field.input.value),
  );
  field.show(user.username ?? "");

  const save = document.createElement("button");
  save.type = "button";
  save.className = "account-button account-save";
  save.textContent = "Save";
  save.disabled = true;

  let allowed: string | undefined;
  const check = createNameCheck({
    fetch,
    current: user.username ?? "",
    schedule: (run, afterMs) => {
      const timer = setTimeout(run, afterMs);
      return () => clearTimeout(timer);
    },
    onVerdict(said) {
      allowed = said.kind === "available" ? said.name : undefined;
      save.disabled = allowed === undefined;
      verdict.textContent = verdictSentence(said);
      verdict.classList.toggle("is-good", said.kind === "available");
      verdict.classList.toggle("is-wrong", said.kind === "taken" || said.kind === "problem");
    },
  });

  save.addEventListener("click", () => {
    if (allowed === undefined) return;
    const name = allowed;
    save.disabled = true;
    void (async () => {
      const trouble = await change({ username: name });
      if (trouble !== undefined) {
        verdict.textContent = trouble;
        verdict.classList.add("is-wrong");
        return;
      }
      verdict.textContent = "Saved.";
      verdict.classList.remove("is-wrong");
      about.textContent = nameSentence(user);
      check.renamed(user.username ?? "");
      options.onRenamed(user);
    })();
  });

  const nameRow = document.createElement("div");
  nameRow.className = "account-name-row";
  nameRow.append(field.row, save);
  naming.append(about, nameRow, verdict);

  // ---- the two settings ------------------------------------------------

  const showing = panel("How you are shown");
  const anonymousNote = line("Your tunes say by Anonymous, and your name is kept to yourself.");
  showing.append(
    createSwitch({
      label: "Show me as Anonymous",
      checked: user.anonymousAuthor,
      onChange(on) {
        void change({ anonymousAuthor: on }).then((trouble) => {
          anonymousNote.textContent =
            trouble ?? "Your tunes say by Anonymous, and your name is kept to yourself.";
          about.textContent = nameSentence(user);
        });
      },
    }).element,
    anonymousNote,
  );

  const counting = panel("Public figures");
  const countingNote = line(
    "Every tune shows figures worked out from players like you: a difficulty blended from solvers' ratings, hearts, and how many solved it in what time. Turn this off to be left out: you will not be asked to rate or upvote, and your ratings, hearts and playthroughs stop counting until you turn it back on.",
  );
  counting.append(
    createSwitch({
      label: "Count my play in public statistics",
      checked: user.shareStats,
      onChange(on) {
        void change({ shareStats: on }).then((trouble) => {
          if (trouble !== undefined) countingNote.textContent = trouble;
        });
      },
    }).element,
    countingNote,
  );

  // ---- this browser's progress -------------------------------------------

  const browser = panel("This browser's progress");
  const browserNote = line();
  browser.append(browserNote);

  async function drawBrowser(): Promise<void> {
    const held: PlayProgress[] = await local.readAll();
    if (held.length === 0) {
      browserNote.replaceChildren("Nothing here that your account does not have.");
      return;
    }
    browserNote.replaceChildren(
      createHandoffLine({
        count: held.length,
        onBringIn: () => {
          void mergeIntoAccount({ fetch, local, records: held }).then((outcome) => {
            if ("trouble" in outcome) {
              browserNote.textContent = outcome.trouble;
              return;
            }
            void drawBrowser();
          });
        },
        onForget: () => {
          void offerToForget(local, held).then((forgot) => {
            if (forgot) void drawBrowser();
          });
        },
      }),
    );
  }
  void drawBrowser();

  // ---- the way out ---------------------------------------------------------

  const leaving = panel("Delete your account");
  const leavingNote = line(
    "Everything you published leaves the site, and other players' progress on it goes with it. Your drafts, your progress and your sign-in are removed.",
  );
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "account-button account-delete";
  remove.textContent = "Delete my account";
  remove.addEventListener("click", () => {
    void (async () => {
      const agreed = await openModal({
        title: "Delete your account?",
        body: [
          "Everything you published leaves the site, and other players' progress on it goes with it.",
          "Your drafts, your progress and your sign-in are removed. This cannot be undone.",
        ],
        confirm: "Delete my account",
        cancel: "Keep it",
      });
      if (!agreed) return;
      remove.disabled = true;
      let response;
      try {
        response = await fetch("/api/me", { method: "DELETE", headers: { accept: "application/json" } });
      } catch {
        leavingNote.textContent = "The server could not be reached. Try again in a moment.";
        remove.disabled = false;
        return;
      }
      if (!response.ok) {
        leavingNote.textContent = await refusal(response);
        remove.disabled = false;
        return;
      }
      window.location.assign("/");
    })();
  });
  leaving.append(leavingNote, remove);
}
