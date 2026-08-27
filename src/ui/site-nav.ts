/**
 * The bar along the top of every page, built once from one list.
 *
 * Every page offers the same places — the levels, a new transcription, and
 * your own transcriptions once you are somebody — with the one you are on
 * marked rather than missing. It was markup copied into each page once, and
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
 * Signing in keeps you where you are: the link carries this page's address
 * back. A page with work in hand can give the nav something to do on the way
 * out — the editor stashes its melody. Signing out goes home: the page you
 * were on may well be one you can no longer open.
 */

import { readMe, type UserSummary } from "../shared/session.js";
import { googleButton } from "./google-button.js";
import { listIcon } from "./icons.js";

export type NavLink = { href: string; label: string; current: boolean };

/**
 * What the corner calls you: the username, chosen or minted alike, and the
 * email only for an account from before names were minted that has not
 * signed in since.
 */
export const cornerLabel = (user: UserSummary): string =>
  user.username ?? user.email;

/** The nav's own pages, and whether this is one of them. */
export function planNav(pathname: string, signedIn: boolean): NavLink[] {
  // The dev server answers `/edit` with `/edit/`; the two are one page.
  const here = pathname.length > 1 ? pathname.replace(/\/$/u, "") : pathname;
  const links: NavLink[] = [
    { href: "/", label: "Levels", current: here === "/" },
    { href: "/edit", label: "New transcription", current: here === "/edit" },
  ];
  if (signedIn) {
    links.push({ href: "/mine", label: "My transcriptions", current: here === "/mine" });
  }
  return links;
}

/**
 * The button that rolls the nav down over a framed page, and up again.
 *
 * The working pages keep the nav out of sight — the frame gives every pixel
 * to the tools and the music — so the way to the rest of the site lives
 * behind this. It only toggles a class; the stylesheet does the rolling.
 */
export function createNavReveal(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-reveal";
  button.title = "Site menu";
  button.setAttribute("aria-label", "Show the site menu");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = listIcon();
  button.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    button.setAttribute("aria-expanded", String(open));
  });
  return button;
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
  a.href = link.href;
  a.textContent = link.label;
  if (link.current) a.setAttribute("aria-current", "page");
  return a;
};

async function hydrate(
  host: HTMLElement,
  beforeGo: () => boolean,
): Promise<UserSummary | undefined> {
  const here = `${window.location.pathname}${window.location.search}`;

  // The places come first, drawn for nobody, so the nav is there before the
  // server has answered who is looking at it.
  host.replaceChildren(...planNav(window.location.pathname, false).map(pageLink));

  let user: UserSummary | undefined;
  try {
    const response = await fetch("/api/me", {
      headers: { accept: "application/json" },
    });
    // A corner that cannot find out stays empty. It is decoration on every
    // page it appears on; the page's own trouble-reporting belongs to the
    // page's own requests.
    if (!response.ok) return undefined;
    user = readMe(await response.json());
  } catch {
    return undefined;
  }

  const links = planNav(window.location.pathname, user !== undefined).map(pageLink);

  if (user === undefined) {
    host.replaceChildren(...links, googleButton({ next: here, compact: true, beforeGo }));
    return undefined;
  }

  // The name is the way to the account's own page: the same grey as the
  // links, and the one place on every page that says usernames exist.
  const name = document.createElement("a");
  name.className = "session-name";
  name.href = "/account";
  name.textContent = cornerLabel(user);
  if (window.location.pathname.replace(/\/$/u, "") === "/account") {
    name.setAttribute("aria-current", "page");
  }

  const out = document.createElement("button");
  out.type = "button";
  out.className = "session-out";
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
