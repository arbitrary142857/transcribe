/**
 * The way in, drawn as Google asks it to be drawn.
 *
 * There is one way to sign in, and Google's rules for a button that uses its
 * name are plain: the words are "Sign in with Google" (or two close cousins),
 * the four-colour G is never resized against them or recoloured, and the
 * whole thing sits on white. This follows the light theme exactly. The font is
 * this site's, which is the one liberty every site that does not load Google's
 * own script takes.
 *
 * There was an icon-only form of it for the corner of the nav; the corner says
 * "Sign In" in words now and opens a box with this button in it, so the only
 * shape left is the one Google draws first.
 *
 * A link, never a fetch: signing in is a chain of top-level navigations, which
 * is what a SameSite=Lax cookie travels on. `beforeGo` is for a page with
 * something to put aside first — the editor stashes its work — and may keep
 * the page by answering false.
 */

import { signInPath } from "../shared/session.js";
import { googleGlyph } from "./icons.js";

export type GoogleButtonOptions = {
  /** Where to come back to afterwards: this page's own address, usually. */
  next: string;
  /** Done as the link is followed; answering false keeps the page instead. */
  beforeGo?: () => boolean;
};

const LABEL = "Sign in with Google";

export function googleButton(options: GoogleButtonOptions): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "google-signin";
  link.href = signInPath(options.next);

  const glyph = document.createElement("span");
  glyph.className = "google-signin-glyph";
  // A constant from icons.ts, never anything that came from anywhere else.
  glyph.innerHTML = googleGlyph();

  const words = document.createElement("span");
  words.className = "google-signin-words";
  words.textContent = LABEL;

  link.append(glyph, words);

  if (options.beforeGo) {
    const beforeGo = options.beforeGo;
    link.addEventListener("click", (event) => {
      if (!beforeGo()) event.preventDefault();
    });
  }

  return link;
}
