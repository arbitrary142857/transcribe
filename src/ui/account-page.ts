/**
 * The account's own page: one tall box, and a row in it for each thing the
 * signed-in person may change about themselves.
 *
 * It was five bordered panels down a wide column, each with its own heading,
 * which made five sections of one short page look like five pages of a
 * settings application. It is one box now, with no rule between the rows: the
 * bold question at the left, the control that answers it flush right, and
 * under both a quiet sentence saying what answering it does. Nothing on this
 * page is about anything but this account, so nothing has to be told apart
 * from anything else — only read in order.
 *
 * The two switches save the moment they flip and put themselves back if the
 * server refuses, since a switch showing one thing while the database holds
 * another is worse than no switch. Deleting asks for the account's name to be
 * typed out: the one gesture here that cannot be taken back is the one that
 * cannot be made by accident.
 *
 * Built from elements with their text set, never from markup; the rules with
 * anything to decide are pure functions, tested on their own.
 */

import { mergeIntoAccount } from "../puzzle/handoff.js";
import type { Fetch, LocalProgressStore, PlayProgress } from "../puzzle/progress.js";
import {
  ANONYMOUS,
  USERNAME,
  cleanUsername,
  readMe,
  type UserSummary,
} from "../shared/session.js";
import { countCharacters } from "../shared/transcription.js";
import { offerToForget } from "./merge-offer.js";
import { marked, openFormModal } from "./modal.js";
import { createNameCheck, type NameVerdict } from "./name-check.js";
import { createSwitch } from "./switch.js";
import { limitTyping } from "./text-entry.js";

// ---- the rules ------------------------------------------------------------

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

/**
 * Whether what was typed into the delete box is this account's own name.
 *
 * Trimmed and settled to one spelling, as `cleanUsername` settles a name
 * being stored, so that a stray space from a paste or a decomposed accent
 * from a keyboard is not a different answer. Case is *not* forgiven: matching
 * the name exactly is the whole of what makes this a deliberate act rather
 * than a second button to press.
 *
 * An account with no name cannot be confirmed against — otherwise an empty
 * box would match an empty name and the question would answer itself.
 */
export function confirmsDeletion(typed: string, username: string): boolean {
  const name = cleanUsername(username);
  return name !== "" && cleanUsername(typed) === name;
}

// ---- what each row says ---------------------------------------------------

/**
 * What being shown as Anonymous does, with this account's own name in it.
 *
 * A placeholder in square brackets asks the reader to do the substitution
 * themselves, on the one page where the site already knows the answer — and
 * it is the answer that makes the sentence worth reading.
 */
export const anonymousAbout = (name: string): string =>
  `When you publish a tune, other users will see the tune marked as "Transcribed by ${name}." If this switch is toggled, other users will instead see "Transcribed by Anonymous."`;

const STATS_ABOUT =
  "Every public tune displays the following statistics: number of completions, number of upvotes, median completion time, median flawless completion time, and average suggested difficulty. If this switch is toggled, none of your data will contribute to any of these statistics.";

const MERGE_ABOUT =
  "We detected progress on public tunes from your browser that this account does not have. If you merge this progress into your account, your progress on each public tune will be set to the furthest recorded progress between your account and your browser.";

const DELETE_ABOUT =
  "All of your published transcriptions, private transcriptions, and progress on public tunes will be permanently removed from the database. This decision is irreversible.";

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
async function refusal(response: {
  status: number;
  json(): Promise<unknown>;
}): Promise<string> {
  const said = (await response.json().catch(() => ({}))) as { error?: string };
  return said.error ?? `The server answered ${response.status}.`;
}

export function createAccountPage(options: AccountPageOptions): void {
  const { host, fetch, local } = options;
  let user = options.user;

  const box = document.createElement("section");
  box.className = "panel account-box";

  const title = document.createElement("h1");
  title.className = "account-title";
  title.textContent = "Account Settings";
  box.append(title);
  host.replaceChildren(box);

  /**
   * One row: the question at the left, whatever answers it flush right, and
   * the quiet sentence under both.
   *
   * The trouble line under that is empty until something fails and takes no
   * room while it is — the switches save as they flip, and a save can be
   * refused by a session that expired in another tab or by a server that is
   * not there.
   */
  function row(
    label: string,
    controls: readonly Node[],
    about?: string,
    /** Where it goes, for the one row that lives inside a box of its own. */
    into: HTMLElement = box,
  ): { element: HTMLElement; head: HTMLElement; trouble: HTMLParagraphElement } {
    const element = document.createElement("div");
    element.className = "account-row";

    const head = document.createElement("div");
    head.className = "account-row-head";

    const name = document.createElement("span");
    name.className = "account-label";
    name.textContent = label;
    head.append(name, ...controls);
    element.append(head);

    if (about !== undefined) {
      const said = document.createElement("p");
      said.className = "account-about";
      said.textContent = about;
      element.append(said);
    }

    const trouble = document.createElement("p");
    trouble.className = "account-trouble";
    trouble.setAttribute("role", "status");
    element.append(trouble);

    into.append(element);
    return { element, head, trouble };
  }

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

  const input = document.createElement("input");
  input.type = "text";
  input.className = "account-input";
  input.id = "account-username";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = user.username ?? "";
  // No `maxlength`: it counts UTF-16 units where every rule here counts
  // characters, so a name of family emoji would be cut off mid-name. See
  // `limitTyping`, which counts the way the database does.
  limitTyping(input, () => USERNAME.max);

  const count = document.createElement("span");
  count.className = "account-count";
  count.setAttribute("aria-hidden", "true");

  const save = document.createElement("button");
  save.type = "button";
  save.className = "account-button account-save";
  save.textContent = "Save";
  save.disabled = true;

  const naming = row("Username", [input, count, save]);
  const verdict = document.createElement("p");
  verdict.className = "account-verdict";
  verdict.setAttribute("role", "status");
  naming.element.append(verdict);

  const showCount = (): void => {
    const used = countCharacters(input.value);
    count.textContent = `${used}/${USERNAME.max}`;
    count.classList.toggle("is-wrong", used > USERNAME.max);
  };
  showCount();

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
      verdict.classList.toggle(
        "is-wrong",
        said.kind === "taken" || said.kind === "problem",
      );
    },
  });

  input.addEventListener("input", () => {
    showCount();
    check.typed(input.value);
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
      renameAbout();
      check.renamed(user.username ?? "");
      options.onRenamed(user);
    })();
  });

  // ---- the two settings --------------------------------------------------

  /**
   * A switch that saves as it flips, and goes back if the save is refused.
   *
   * Without the going back, a refusal leaves the page showing one answer and
   * the database holding the other, and the next thing the person does is
   * based on a lie the page told them.
   */
  function setting(
    label: string,
    on: boolean,
    about: string,
    field: string,
  ): HTMLElement {
    const control = createSwitch({
      spoken: label,
      checked: on,
      onChange(next) {
        void change({ [field]: next }).then((trouble) => {
          said.trouble.textContent = trouble ?? "";
          if (trouble !== undefined) control.set(!next);
        });
      },
    });
    const said = row(label, [control.element], about);
    return said.element;
  }

  const anonymity = setting(
    "Show me as Anonymous?",
    user.anonymousAuthor,
    anonymousAbout(user.username ?? ANONYMOUS),
    "anonymousAuthor",
  );
  setting(
    "Contribute to public stats?",
    user.shareStats,
    STATS_ABOUT,
    "shareStats",
  );

  /** The sentence that names the account, said again under its new name. */
  function renameAbout(): void {
    const said = anonymity.querySelector(".account-about");
    if (said !== null) said.textContent = anonymousAbout(user.username ?? ANONYMOUS);
  }

  // ---- this browser's progress -------------------------------------------

  /**
   * Drawn only when there is something to offer, and taken away again once
   * there is not — a row saying "nothing here" is a row about nothing.
   *
   * Built after `readAll` answers rather than emptied afterwards, so the page
   * does not settle in front of the reader.
   */
  let merging: HTMLElement | undefined;

  async function drawBrowser(): Promise<void> {
    const held: PlayProgress[] = await local.readAll();
    merging?.remove();
    merging = undefined;
    if (held.length === 0) return;

    const bring = document.createElement("button");
    bring.type = "button";
    bring.className = "account-button";
    bring.textContent = "Merge Progress";

    const forget = document.createElement("button");
    forget.type = "button";
    forget.className = "account-button is-quiet";
    forget.textContent = "Forget It";

    const said = row("Merge browser progress?", [bring, forget], MERGE_ABOUT);
    merging = said.element;
    // The delete box below it was drawn first, so this one has to be put back
    // where it belongs rather than appended after it.
    box.insertBefore(said.element, danger);

    bring.addEventListener("click", () => {
      bring.disabled = true;
      void mergeIntoAccount({ fetch, local, records: held }).then((outcome) => {
        if ("trouble" in outcome) {
          said.trouble.textContent = outcome.trouble;
          bring.disabled = false;
          return;
        }
        void drawBrowser();
      });
    });

    forget.addEventListener("click", () => {
      // Behind its own question: what it throws away cannot come back.
      void offerToForget(local, held).then((forgot) => {
        if (forgot) void drawBrowser();
      });
    });
  }

  // ---- the way out -------------------------------------------------------

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "account-button account-delete";
  remove.textContent = "Yes, Delete";

  /**
   * The one thing on this page that cannot be undone, in a box of its own.
   *
   * A pale red ground and a dark red edge, inset from the white box by the
   * same margin on both sides and at the foot — which falls out of the white
   * box's own padding, the three being equal. Everything above it is a
   * setting to be changed back at will; this is not, and it should not look
   * like the rows above it while it reads like one of them.
   */
  const danger = document.createElement("div");
  danger.className = "account-danger";
  box.append(danger);

  const leavingRow = row("Delete your account?", [remove], DELETE_ABOUT, danger);

  remove.addEventListener("click", () => {
    void (async () => {
      if (!(await askToDelete(user))) return;
      remove.disabled = true;
      let response;
      try {
        response = await fetch("/api/me", {
          method: "DELETE",
          headers: { accept: "application/json" },
        });
      } catch {
        leavingRow.trouble.textContent =
          "The server could not be reached. Try again in a moment.";
        remove.disabled = false;
        return;
      }
      if (!response.ok) {
        leavingRow.trouble.textContent = await refusal(response);
        remove.disabled = false;
        return;
      }
      window.location.assign("/");
    })();
  });

  void drawBrowser();
}

/**
 * The last question, which has to be answered in writing.
 *
 * A yes/no box is one press away from a mistake nothing can undo, so this one
 * asks for the account's own name, spelled out. The name is marked in the
 * accent inside the sentence, so what has to be typed is findable without
 * being a field label of its own.
 */
async function askToDelete(user: UserSummary): Promise<boolean> {
  // Every account has a name; the email is a backstop for a row from before
  // names were minted, so that such an account is never simply trapped.
  const name = user.username ?? user.email;

  return openFormModal({
    title: "Are you sure?",
    className: "account-delete-modal",
    confirm: "Delete Account",
    cancel: "Nevermind",
    valid: false,
    fill(form) {
      const said = document.createElement("p");
      said.className = "modal-body";
      said.append(
        "This decision is irreversible. Please type your username ",
        marked(name),
        " into the box below to confirm.",
      );

      const typed = document.createElement("input");
      typed.type = "text";
      typed.className = "account-input account-confirm";
      typed.autocomplete = "off";
      typed.spellcheck = false;
      typed.setAttribute("aria-label", `Type ${name} to confirm`);
      typed.addEventListener("input", () =>
        form.setValid(confirmsDeletion(typed.value, name)),
      );

      return [said, typed];
    },
  });
}
