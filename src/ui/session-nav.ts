/**
 * The corner of the nav that knows who you are.
 *
 * Every page asks /api/me afresh — these are separate pages, not views of one
 * app, so nothing carries the answer between them. Until the answer arrives
 * the corner is simply empty; a "Sign in" that flashed into "Signed in as…"
 * would be the nav changing its mind in front of you.
 *
 * When the answer is nobody, the corner is a link straight into the Google
 * flow. A link and not a fetch, deliberately: the whole sign-in is a chain of
 * top-level navigations, which is exactly the kind of request a SameSite=Lax
 * cookie travels on. And no modal before it — there is one way to sign in, so
 * there is nothing to choose.
 */

import { readMe, type UserSummary } from "../shared/session.js";

export function mountSessionNav(host: HTMLElement): void {
  void hydrate(host);
}

async function hydrate(host: HTMLElement): Promise<void> {
  let user: UserSummary | undefined;
  try {
    const response = await fetch("/api/me", {
      headers: { accept: "application/json" },
    });
    // A corner that cannot find out stays empty. It is decoration on every
    // page it appears on; the page's own trouble-reporting belongs to the
    // page's own requests.
    if (!response.ok) return;
    user = readMe(await response.json());
  } catch {
    return;
  }

  if (user === undefined) {
    const link = document.createElement("a");
    link.href = "/api/auth/google";
    link.textContent = "Sign in";
    host.replaceChildren(link);
    return;
  }

  // The name is a fact, not a door: same grey as the links, nothing to press.
  const name = document.createElement("span");
  name.className = "session-name";
  name.textContent = user.username ?? user.email;

  const out = document.createElement("button");
  out.type = "button";
  out.className = "session-out";
  out.textContent = "Sign out";
  out.addEventListener("click", () => {
    out.disabled = true;
    void signOut();
  });

  host.replaceChildren(name, out);
}

async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // The reload below asks /api/me again, so whatever the truth now is,
    // the corner will show it.
  }
  window.location.reload();
}
