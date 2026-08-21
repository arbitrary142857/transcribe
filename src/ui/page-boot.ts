/**
 * The three things every page holding a score has to do before it can draw one.
 *
 * Shared by the editor entry and the play entry, which arrive at a score by
 * different routes and need exactly the same footing once they get there.
 */

import type { Fetch } from "../puzzle/progress.js";
import { googleButton } from "./google-button.js";

/**
 * The browser's own `fetch`, in the shape the progress stores take.
 *
 * The stores are handed their fetch rather than reaching for the global, so
 * a test can hand them a recording; this is the one the pages hand them.
 */
export const browserFetch: Fetch = (url, init) => fetch(url, init);

/**
 * Make sure the score fonts are usable before anything is measured.
 *
 * Bar widths come from measuring the glyphs, and a canvas measures a font it
 * does not have yet against a fallback — so without this the first layout is
 * built from the wrong numbers and every bar shifts as soon as anything
 * redraws. `document.fonts.ready` alone is not enough: it reports "loaded"
 * while these faces are still unrequested.
 */
export async function loadScoreFonts(): Promise<void> {
  if (!document.fonts) {
    return;
  }
  await Promise.all([
    document.fonts.load("30pt Bravura"),
    document.fonts.load("10pt Academico"),
  ]);
  await document.fonts.ready;
}

/** The element the page's markup promises, or a thrown explanation of which. */
export function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`No element with id "${id}"`);
  }
  return element;
}

/**
 * Said instead of the score, with the way back to the list — and, when
 * signing in would help, the way to do that and come straight back here.
 *
 * Takes the element to fill because the two pages have nowhere in common to
 * put it: the editor has its setup region standing empty at this point, and
 * the play page has only its workspace.
 */
export function showTrouble(
  host: HTMLElement,
  message: string,
  options: { heading?: string; signIn?: string } = {},
): void {
  host.replaceChildren();

  const panel = document.createElement("section");
  panel.className = "panel setup-panel level-trouble";

  const heading = document.createElement("h1");
  heading.className = "page-title";
  heading.textContent = options.heading ?? "That level could not be opened";

  const said = document.createElement("p");
  said.className = "page-lede";
  said.textContent = message;

  panel.append(heading, said);

  if (options.signIn !== undefined) {
    const sign = document.createElement("p");
    sign.className = "level-trouble-signin";
    sign.append(googleButton({ next: options.signIn }));
    panel.append(sign);
  }

  const back = document.createElement("p");
  const link = document.createElement("a");
  link.href = "/";
  link.textContent = "Back to the levels";
  back.append(link);

  panel.append(back);
  host.append(panel);
}

/**
 * What went wrong, in a sentence; and whether signing in is the remedy, so
 * the page can offer it rather than merely report it.
 */
export type Trouble = { trouble: string; signIn?: true };

/**
 * What went wrong fetching a level, in a sentence, or the body if nothing did.
 *
 * Both pages ask for a level by id and both have to answer the same handful of
 * ways it can fail — a server that cannot be reached, a level that is not
 * there, a reply that is not JSON because a captive portal answered instead,
 * and now a level that is somebody's and nobody is signed in.
 */
export async function fetchLevel<T>(path: string): Promise<T | Trouble> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { accept: "application/json" } });
  } catch {
    return { trouble: "The server could not be reached. Try again in a moment." };
  }

  if (response.status === 404) {
    return { trouble: "There is no level with that address." };
  }
  if (!response.ok) {
    const said = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    const trouble = said.error ?? `The server answered ${response.status}.`;
    return response.status === 401 ? { trouble, signIn: true } : { trouble };
  }

  try {
    return (await response.json()) as T;
  } catch {
    return { trouble: "The server's answer could not be read." };
  }
}
