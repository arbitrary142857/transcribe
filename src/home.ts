/**
 * The home page: the mark, the name, what the place is, and the three demos.
 *
 * The page is in the markup — nothing is fetched to draw it — so there are
 * only the things every page's script does for itself. The bar along the top,
 * as everywhere; the demos, which are markup too but hold back their video
 * files until they are scrolled to (see `ui/home-demos.ts` for why); and the
 * one row of peppers quoted in the third demo's words.
 *
 * The peppers are drawn rather than written out because `ui/difficulty.ts` is
 * where the shape of a pepper is decided, for the card, the level's box and
 * the stepper alike. A row copied into the markup would be a fourth drawing
 * of it, and the first to go stale.
 */

import { pepperGlyphs } from "./ui/difficulty.js";
import { mountHomeDemos } from "./ui/home-demos.js";
import { mountSiteNav } from "./ui/site-nav.js";

mountSiteNav(document.getElementById("site-nav")!);
mountHomeDemos();

/** Three and a half of five: a rating with a half in it, so the row shows
    both what a pepper looks like filled and that halves are said at all. */
document.getElementById("home-peppers")?.append(...pepperGlyphs(3.5));
