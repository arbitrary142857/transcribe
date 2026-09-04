/**
 * The bar along the top of every page, built once from one list.
 *
 * Every page offers the same places — the public tunes, a new tune, and your
 * own tunes once you are somebody — with the one you are on marked rather
 * than missing. It was markup copied into each page once, and
 * each copy left out a different link; a list written here is the only way
 * five pages agree.
 *
 * The right-hand corner knows who you are. Every page asks /api/me afresh —
 * these are separate pages, not views of one app, so nothing carries the
 * answer between them. Until it arrives the corner is empty; a "Sign in" that
 * flashed into a name would be the nav changing its mind in front of you. The
 * answer is handed back to the page as well as drawn, because the page has
 * its own uses for it — whether Save will work, whose cards carry tools — and
 * asking twice would be one request too many. The name in the corner is the
 * link to the account's own page, where it can be changed.
 *
 * It stays in view on every page, the working ones included. It was rolled
 * up behind a button on those for a while, to give the frame every pixel; the
 * button was one more thing to know about, and the row of links costs less
 * than the knowing did.
 *
 * Signing in keeps you where you are: the corner's "Sign In" opens the box in
 * `sign-in-offer.ts`, whose one door carries this page's address back. A page
 * with work in hand can give the nav something to do on the way out — the
 * editor stashes its melody. Signing out goes home: the page you were on may
 * well be one you can no longer open.
 */

import { readMe, type UserSummary } from "../shared/session.js";
import { openSignInOffer } from "./sign-in-offer.js";

export type NavLink = { href: string; label: string; current: boolean };

/**
 * What the corner calls you: the username, chosen or minted alike, and the
 * email only for an account from before names were minted that has not
 * signed in since.
 */
export const cornerLabel = (user: UserSummary): string =>
  user.username ?? user.email;

/**
 * The nav's own pages, and whether this is one of them.
 *
 * Two links either way, and which the second is depends on who is looking.
 * Signed in, it is your own list — which carries its own button to the
 * editor, so a second way there in the bar beside it would be the same
 * invitation twice. Signed out there is no such list, so the invitation is
 * the nav's to make.
 *
 * Home is not among them. The wordmark to the left of this row is the door
 * to it — on every page, so it is already the one thing in the bar that is
 * always the same — and a second door beside it would be the row saying what
 * the corner has said. Which is why `/` marks nothing here.
 */
export function planNav(pathname: string, signedIn: boolean): NavLink[] {
  // The dev server answers `/edit` with `/edit/`; the two are one page.
  const here = pathname.length > 1 ? pathname.replace(/\/$/u, "") : pathname;
  return [
    { href: "/tunes", label: "Public Tunes", current: here === "/tunes" },
    signedIn
      ? { href: "/mine", label: "My Tunes", current: here === "/mine" }
      : { href: "/edit", label: "Create Tune", current: here === "/edit" },
  ];
}

export type SiteNav = {
  /** Who is signed in, once /api/me has said. */
  viewer: Promise<UserSummary | undefined>;
  /**
   * Something to do as the nav's sign-in leaves the page. Answering false
   * keeps the page — for a stash that could not be written.
   */
  beforeSignIn(hook: () => boolean): void;
};

export function mountSiteNav(host: HTMLElement): SiteNav {
  let beforeGo: (() => boolean) | undefined;
  const viewer = hydrate(host, () => beforeGo?.() ?? true);
  return {
    viewer,
    beforeSignIn(hook) {
      beforeGo = hook;
    },
  };
}

const pageLink = (link: NavLink): HTMLAnchorElement => {
  const a = document.createElement("a");
  a.className = "nav-tab";
  a.href = link.href;
  a.textContent = link.label;
  if (link.current) a.setAttribute("aria-current", "page");
  return a;
};

/**
 * The corner's way in: a word in the bar's own voice, not Google's button.
 *
 * Google's button belongs on a page that is asking for it, at the size its
 * rules describe; in the corner of a bar of quiet words it was the loudest
 * thing on every page, and it said nothing about what signing in is for. So
 * the corner says "Sign In" and the button lives in the box that opens, beside
 * the reasons.
 */
function signInText(next: string, beforeGo: () => boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-word session-in";
  button.textContent = "Sign In";
  button.addEventListener("click", () => {
    void openSignInOffer({ next, beforeGo });
  });
  return button;
}

async function hydrate(
  host: HTMLElement,
  beforeGo: () => boolean,
): Promise<UserSummary | undefined> {
  const here = `${window.location.pathname}${window.location.search}`;

  // The places come first, drawn for nobody, so the nav is there before the
  // server has answered who is looking at it.
  host.replaceChildren(...planNav(window.location.pathname, false).map(pageLink));

  // A corner that cannot find out draws the way in, because not knowing and
  // being nobody come to the same thing everywhere else on the page: `viewer`
  // resolves to undefined either way, so /mine already says "Sign in to see
  // your tunes" and the editor already offers the trip to sign in. The nav
  // used to be the one part that disagreed — it returned here and kept the
  // links it had drawn for nobody, with no Sign In among them — so a failed
  // /api/me left a signed-out visitor with no door at all and nothing to say
  // why. The asymmetry decides it: offering the door to somebody already
  // signed in costs them a click and lands them back where they were, and
  // that is much the smaller wrong.
  //
  // A 429 from the rate limiter is now one of the ways this can fail, which is
  // what made a latent dead end reachable.
  let user: UserSummary | undefined;
  try {
    const response = await fetch("/api/me", {
      headers: { accept: "application/json" },
    });
    if (response.ok) user = readMe(await response.json());
  } catch {
    // Unreadable and unreachable both read as nobody, and fall through.
  }

  const links = planNav(window.location.pathname, user !== undefined).map(pageLink);

  if (user === undefined) {
    host.replaceChildren(...links, signInText(here, beforeGo));
    return undefined;
  }

  // The name is the way to the account's own page: the same grey as the
  // links, and the one place on every page that says usernames exist.
  const name = document.createElement("a");
  name.className = "nav-tab session-name";
  name.href = "/account";
  name.textContent = cornerLabel(user);
  if (window.location.pathname.replace(/\/$/u, "") === "/account") {
    name.setAttribute("aria-current", "page");
  }

  const out = document.createElement("button");
  out.type = "button";
  out.className = "nav-word session-out";
  out.textContent = "Sign out";
  out.addEventListener("click", () => {
    out.disabled = true;
    void signOut();
  });

  host.replaceChildren(...links, name, out);
  return user;
}

async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Home asks /api/me again, so whatever the truth now is, it will show.
  }
  // Home rather than here: here may be a draft that is no longer yours to open.
  window.location.assign("/");
}
