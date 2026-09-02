/**
 * The home page: the mark, the name, and the nav around them.
 *
 * Nothing is fetched and nothing is drawn here — the page is in the markup —
 * so this is only the bar along the top, which every page mounts for itself.
 */

import { mountSiteNav } from "./ui/site-nav.js";

mountSiteNav(document.getElementById("site-nav")!);
