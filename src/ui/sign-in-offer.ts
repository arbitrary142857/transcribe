/**
 * The box the corner's "Sign In" opens: the way in, and why it is worth taking.
 *
 * The nav used to carry Google's own button in the corner, which is the
 * loudest thing on a bar of quiet words and says nothing about what signing in
 * is *for*. So the corner says "Sign In" in the bar's own voice and the button
 * moved in here, at full size and under the reasons.
 *
 * It asks nothing, so there is no "Not now" to press: an × in the corner, the
 * backdrop and Escape are the ways out, and the one control in the box is the
 * way in. A box with a cancel button beside a sign-in button asks the reader
 * which of two things they are doing; a box with a × asks nothing at all.
 *
 * The perks are the three things a visitor signed out cannot do. The sentence
 * under them is the other half of an honest ask — an account can be undone —
 * and it links to the page that says so in full rather than summarising it
 * here, where it would be one more thing to keep true in two places.
 */

import { signInPath } from "../shared/session.js";
import { googleButton } from "./google-button.js";
import { openInfoModal } from "./modal.js";

export type SignInOffer = {
  title: string;
  /** The sentence above the list. */
  lede: string;
  /** What an account gets you, one line each. */
  perks: readonly string[];
  /** The sentence under the list, and the words in it that are a link. */
  note: { lead: string; link: string; href: string; tail: string };
  /** Where the way in points, this page's address folded in. */
  href: string;
};

/** What the box says, and where its one door goes. */
export function signInOffer(next: string): SignInOffer {
  return {
    title: "Sign In",
    lede: "Signing into an account comes with the following perks:",
    perks: [
      "Creating, saving, and publishing your own tunes.",
      "Upvoting and rating the difficulty of public tunes.",
      "Saving your progress on public tunes across all browsers and devices.",
    ],
    note: {
      lead: "You may fully delete your account at any time. See the ",
      link: "Privacy Policy",
      href: "/privacy",
      tail: " for further details.",
    },
    href: signInPath(next),
  };
}

/**
 * Put the offer up.
 *
 * Nothing is decided here, so nothing comes back: the one control is a link,
 * and following it leaves the page. `beforeGo` is the page's chance to put
 * work aside on the way out — the editor stashes its melody — and may keep the
 * page by answering false.
 */
export function openSignInOffer(options: {
  next: string;
  beforeGo?: () => boolean;
}): void {
  const offer = signInOffer(options.next);

  openInfoModal({
    className: "signin-modal",
    fill: () => {
      const heading = document.createElement("h2");
      heading.className = "modal-title";
      heading.textContent = offer.title;

      const lede = document.createElement("p");
      lede.className = "modal-body";
      lede.textContent = offer.lede;

      const list = document.createElement("ul");
      list.className = "modal-list";
      for (const perk of offer.perks) {
        const item = document.createElement("li");
        item.textContent = perk;
        list.append(item);
      }

      const note = document.createElement("p");
      note.className = "modal-body signin-note";
      const link = document.createElement("a");
      link.href = offer.note.href;
      link.textContent = offer.note.link;
      note.append(offer.note.lead, link, offer.note.tail);

      // Centred and alone under everything, because it is the only thing in
      // the box to press.
      const way = document.createElement("div");
      way.className = "signin-way";
      way.append(googleButton({ next: options.next, beforeGo: options.beforeGo }));

      return [heading, lede, list, note, way];
    },
  });
}
